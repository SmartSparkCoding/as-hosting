import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWebsiteBySlug } from '$lib/server/services/website.service';
import { recordAnalyticsEvent } from '$lib/server/services/analytics.service';
import { clampInteger, cleanHost, normalisePath } from '$lib/server/analytics/collect';
import { readCollectContext } from '$lib/server/analytics/request';

const MAX_BODY_BYTES = 2048;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_EVENTS = 40;

const buckets = new Map<string, number[]>();

function rateLimited(key: string): boolean {
	const now = Date.now();
	const recent = (buckets.get(key) ?? []).filter((time) => now - time < RATE_WINDOW_MS);

	if (recent.length >= RATE_MAX_EVENTS) {
		buckets.set(key, recent);
		return true;
	}

	recent.push(now);
	buckets.set(key, recent);

	// Keep the map from growing forever on a long-lived process.
	if (buckets.size > 5000) {
		for (const [bucketKey, times] of buckets) {
			if (times.every((time) => now - time >= RATE_WINDOW_MS)) buckets.delete(bucketKey);
		}
	}

	return false;
}

function sameOrigin(request: Request, requestUrl: URL): boolean {
	const origin = request.headers.get('origin');
	if (!origin) return true;

	try {
		return new URL(origin).host === requestUrl.host;
	} catch {
		return false;
	}
}

export const POST: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!sameOrigin(request, url)) {
		return json({ ok: false }, { status: 403 });
	}

	const contentType = request.headers.get('content-type') ?? '';
	if (!contentType.includes('application/json')) {
		return json({ ok: false }, { status: 415 });
	}

	const text = await request.text();
	if (text.length > MAX_BODY_BYTES) {
		return json({ ok: false }, { status: 413 });
	}

	let body: Record<string, unknown>;
	try {
		body = JSON.parse(text) as Record<string, unknown>;
	} catch {
		return json({ ok: false }, { status: 400 });
	}

	const type = body.type === 'engagement' ? 'engagement' : body.type === 'outbound' ? 'outbound' : null;
	if (!type) {
		return json({ ok: false }, { status: 400 });
	}

	const site = typeof body.site === 'string' ? body.site : '';
	if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(site)) {
		return json({ ok: false }, { status: 400 });
	}

	const context = readCollectContext(request, getClientAddress);

	if (rateLimited(context.ip ?? 'unknown')) {
		return json({ ok: false }, { status: 429 });
	}

	const website = await getWebsiteBySlug(site);
	if (!website || website.status !== 'ACTIVE') {
		return json({ ok: false }, { status: 404 });
	}

	const path = normalisePath(typeof body.path === 'string' ? body.path : '/');

	try {
		if (type === 'outbound') {
			const targetHost = cleanHost(typeof body.targetHost === 'string' ? body.targetHost : null);
			if (!targetHost) {
				return json({ ok: false }, { status: 400 });
			}

			await recordAnalyticsEvent({
				websiteId: website.id,
				type: 'outbound',
				path,
				ctx: context,
				targetHost
			});

			return json({ ok: true });
		}

		const language =
			typeof body.language === 'string' &&
			/^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8}){0,2}$/.test(body.language)
				? body.language.slice(0, 35)
				: context.language;

		await recordAnalyticsEvent({
			websiteId: website.id,
			type: 'engagement',
			path,
			ctx: { ...context, language },
			durationSeconds: clampInteger(body.duration, 0, 86_400),
			scrollDepth: clampInteger(body.scroll, 0, 100),
			screenWidth: clampInteger(body.screenWidth, 0, 10_000),
			screenHeight: clampInteger(body.screenHeight, 0, 10_000)
		});

		return json({ ok: true });
	} catch (err) {
		// Never let a measurement failure turn into an HTML error page for a
		// beacon fired from someone else's website.
		console.error('[analytics] Failed to record beacon:', err);
		return json({ ok: false }, { status: 500 });
	}
};

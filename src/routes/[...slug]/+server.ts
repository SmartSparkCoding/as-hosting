import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWebsiteBySlug } from '$lib/server/services/website.service';
import { getGroupBySlug, getWebsitesInGroup } from '$lib/server/services/group.service';
import { recordAnalyticsEvent } from '$lib/server/services/analytics.service';
import { normalisePath, hasDownloadExtension, parseUtm } from '$lib/server/analytics/collect';
import { readCollectContext } from '$lib/server/analytics/request';
import { HostingStorage } from '$lib/server/hosting/storage';
import { renderSectionPage } from '$lib/server/hosting/section-page';
import {
	buildSiteAccessCookie,
	checkSitePassword,
	hasSiteAccess,
	renderPasswordPage
} from '$lib/server/hosting/site-access';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.webp': 'image/webp',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.txt': 'text/plain',
	'.xml': 'application/xml',
	'.pdf': 'application/pdf',
	'.zip': 'application/zip'
};

const ANALYTICS_SCRIPT_PATH = '/__as-hosting/analytics.js';

function getMimeType(filePath: string): string {
	const ext = '.' + filePath.split('.').pop()?.toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

function isPathSafe(requestedPath: string): boolean {
	const normalized = normalize(requestedPath);
	return !normalized.startsWith('..') && !normalized.startsWith('/');
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * The `<base>` href for a page served from a directory index. Relative asset
 * URLs must resolve against the directory the visitor is actually on, so
 * `/<slug>/blog/` keeps `style.css` pointed at `/<slug>/blog/style.css`.
 */
function directoryBaseHref(slug: string, sitePath: string): string {
	const suffix = sitePath === '/' ? '/' : `${sitePath}/`;
	return `/${slug}${suffix}`;
}

/**
 * Adds the `<base>` tag (when the page is served from a directory index) plus
 * the tiny analytics script. The script reports engagement/outbound clicks
 * only; pageviews are counted server-side so they still work with JS off.
 */
function prepareHtml(
	html: string,
	basePath: string | null,
	slug: string,
	sitePath: string,
	noindex = false
): string {
	let output = html;

	if (noindex) {
		const robots = '<meta name="robots" content="noindex, nofollow">';
		if (/<head[^>]*>/i.test(output)) {
			output = output.replace(/<head([^>]*)>/i, `<head$1>${robots}`);
		} else {
			output = `${robots}${output}`;
		}
	}

	if (basePath) {
		const base = `<base href="${escapeAttribute(basePath)}">`;
		if (/<head[^>]*>/i.test(output)) {
			output = output.replace(/<head([^>]*)>/i, `<head$1>${base}`);
		} else {
			output = `${base}${output}`;
		}
	}

	const script =
		`<script defer src="${ANALYTICS_SCRIPT_PATH}" ` +
		`data-site="${escapeAttribute(slug)}" data-path="${escapeAttribute(sitePath)}"></script>`;

	if (/<\/body>/i.test(output)) {
		return output.replace(/<\/body>/i, `${script}</body>`);
	}

	return `${output}${script}`;
}

function splitSlug(rawSlug: string | undefined): { slug: string; subPath: string } {
	if (!rawSlug || !isPathSafe(rawSlug)) {
		throw error(404, 'Not found');
	}

	const slashIndex = rawSlug.indexOf('/');
	const slug = slashIndex === -1 ? rawSlug : rawSlug.slice(0, slashIndex);
	const subPath = slashIndex === -1 ? '' : rawSlug.slice(slashIndex + 1);

	if (!slug || !isPathSafe(slug)) {
		throw error(404, 'Not found');
	}

	return { slug, subPath };
}

function gateHeaders(extra: Record<string, string> = {}): Record<string, string> {
	return { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', ...extra };
}

/**
 * A slug that belongs to no site may belong to a section (a group of sites).
 *
 *   /<section>/            -> index page listing the section's public sites
 *   /<section>/<site>/     -> 302 to the site itself
 *
 * Sections share one namespace with sites, so a section can never shadow a
 * site: this only runs after the site lookup came back empty.
 */
async function handleSectionRequest(
	slug: string,
	subPath: string,
	url: URL
): Promise<Response | null> {
	const group = await getGroupBySlug(slug);
	if (!group) return null;

	const rest = subPath.replace(/\/+$/, '');

	if (rest) {
		// Only one level deep: /<section>/<site>, never /<section>/<site>/<file>.
		if (rest.includes('/')) return null;

		const target = await getWebsiteBySlug(rest);
		if (!target || target.groupId !== group.id || target.status !== 'ACTIVE') return null;

		return new Response(null, {
			status: 302,
			headers: { Location: `/${rest}/${url.search}`, 'Cache-Control': 'no-store' }
		});
	}

	const sites = await getWebsitesInGroup(group.id);
	const listed = sites
		.filter((site) => site.status === 'ACTIVE' && (site.visibility ?? 'PUBLIC') === 'PUBLIC')
		.map((site) => ({ name: site.name, slug: site.slug }));

	const hidesSomething = sites.some(
		(site) => site.status === 'ACTIVE' && (site.visibility ?? 'PUBLIC') !== 'PUBLIC'
	);

	return new Response(
		renderSectionPage({ groupName: group.name, description: group.description, sites: listed }),
		{
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Cache-Control': 'public, max-age=60',
				...(hidesSomething ? { 'X-Robots-Tag': 'noindex, nofollow' } : {})
			}
		}
	);
}

export const GET: RequestHandler = async ({ params, url, request, cookies, getClientAddress }) => {
	const { slug, subPath } = splitSlug(params.slug);

	const website = await getWebsiteBySlug(slug);
	if (!website) {
		const section = await handleSectionRequest(slug, subPath, url);
		if (section) return section;

		throw error(404, 'Website not found');
	}

	if (website.status !== 'ACTIVE') {
		throw error(404, 'Website not available');
	}

	const visibility = website.visibility ?? 'PUBLIC';
	const passwordHash = website.accessPasswordHash ?? null;
	const noindex = visibility !== 'PUBLIC';

	if (visibility === 'PASSWORD' && !hasSiteAccess(cookies, slug, passwordHash)) {
		const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html');

		if (!wantsHtml) {
			return new Response('This site is password protected.', {
				status: 401,
				headers: gateHeaders({ 'Content-Type': 'text/plain; charset=utf-8' })
			});
		}

		return new Response(
			renderPasswordPage({ siteName: website.name, next: url.pathname + url.search }),
			{
				status: 401,
				headers: gateHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
			}
		);
	}

	const cacheFor = (publicMaxAge: number) =>
		visibility === 'PUBLIC'
			? `public, max-age=${publicMaxAge}`
			: 'private, max-age=0, must-revalidate';

	const robotsHeaders: Record<string, string> = noindex
		? { 'X-Robots-Tag': 'noindex, nofollow' }
		: {};

	const sitePath = normalisePath(url.pathname.slice(slug.length + 1));
	const context = readCollectContext(request, getClientAddress);

	const capture = (type: 'pageview' | 'download' | 'not_found') => {
		void recordAnalyticsEvent({
			websiteId: website.id,
			type,
			path: sitePath,
			ctx: context,
			utm: type === 'pageview' ? parseUtm(url.searchParams) : null
		}).catch((err) => console.error('[analytics] Failed to record event:', err));
	};

	const storage = new HostingStorage();
	const basePath = storage.getServePath(website.id);

	// Strip trailing slashes from file path
	let filePath = subPath.replace(/\/+$/, '');
	if (!filePath || filePath === '') {
		filePath = 'index.html';
	}

	if (!isPathSafe(filePath)) {
		throw error(403, 'Forbidden');
	}

	const fullPath = join(basePath, filePath);

	const resolvedBase = normalize(basePath);
	const resolvedFull = normalize(fullPath);
	if (!resolvedFull.startsWith(resolvedBase)) {
		throw error(403, 'Forbidden');
	}

	try {
		const fileStat = await stat(fullPath);
		if (fileStat.isDirectory()) {
			const indexPath = join(fullPath, 'index.html');
			try {
				await stat(indexPath);
				const content = await readFile(indexPath, 'utf-8');
				capture('pageview');
				return new Response(
					prepareHtml(content, directoryBaseHref(slug, sitePath), slug, sitePath, noindex),
					{
						headers: {
							'Content-Type': 'text/html',
							'Cache-Control': cacheFor(300),
							...robotsHeaders
						}
					}
				);
			} catch {
				capture('not_found');
				throw error(404, 'Not found');
			}
		}

		const content = await readFile(fullPath);
		const mimeType = getMimeType(fullPath);

		if (mimeType === 'text/html') {
			const html = content.toString('utf-8');
			capture('pageview');
			return new Response(
				prepareHtml(html, subPath ? null : `/${slug}/`, slug, sitePath, noindex),
				{
					headers: {
						'Content-Type': mimeType,
						'Cache-Control': cacheFor(60),
						...robotsHeaders
					}
				}
			);
		}

		if (hasDownloadExtension(fullPath)) {
			capture('download');
		}

		return new Response(content, {
			headers: {
				'Content-Type': mimeType,
				'Cache-Control': cacheFor(mimeType.startsWith('text/') ? 60 : 86400),
				...robotsHeaders
			}
		});
	} catch (e: any) {
		if (e?.status === 404) throw e;
		capture('not_found');
		throw error(404, 'Not found');
	}
};

/**
 * Shared-password submissions land back on the page the visitor was trying to
 * read. Everything else on a protected site is read-only, so this is the only
 * POST this catch-all accepts.
 */
export const POST: RequestHandler = async ({ params, url, request, cookies, getClientAddress }) => {
	const { slug } = splitSlug(params.slug);

	const website = await getWebsiteBySlug(slug);
	if (!website || website.status !== 'ACTIVE') {
		throw error(404, 'Website not found');
	}

	if ((website.visibility ?? 'PUBLIC') !== 'PASSWORD') {
		return new Response(null, { status: 303, headers: { Location: url.pathname } });
	}

	const passwordHash = website.accessPasswordHash ?? null;
	const form = await request.formData();
	const password = String(form.get('password') ?? '');
	const result = await checkSitePassword(slug, password, passwordHash, getClientAddress());

	if (!result.ok) {
		const message = result.retryAfter
			? `Too many tries. Wait ${Math.ceil(result.retryAfter / 60)} minute(s).`
			: 'That password is not right.';

		return new Response(
			renderPasswordPage({ siteName: website.name, next: url.pathname + url.search, error: message }),
			{
				status: 401,
				headers: gateHeaders({ 'Content-Type': 'text/html; charset=utf-8' })
			}
		);
	}

	const cookie = passwordHash ? buildSiteAccessCookie(slug, passwordHash) : null;

	return new Response(null, {
		status: 303,
		headers: {
			Location: url.pathname + url.search,
			'Cache-Control': 'no-store',
			...(cookie ? { 'Set-Cookie': cookie } : {})
		}
	});
};

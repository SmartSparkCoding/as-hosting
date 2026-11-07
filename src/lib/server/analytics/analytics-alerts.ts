import { and, count, desc, eq, gte, lt } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '../db';
import { analyticsEvents, users, websites } from '../db/schema';
import {
	createSlackNotifier,
	notifyErrorSpike,
	notifyTrafficDrop,
	notifyTrafficSpike
} from '../slack/notifier';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const SPIKE_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const DROP_COOLDOWN_MS = 24 * 60 * 60 * 1000;

const MIN_SPIKE_VIEWS = 20;
const SPIKE_FACTOR = 4;
const MIN_NOT_FOUND = 10;
const NOT_FOUND_FACTOR = 3;
const DROP_MIN_PRIOR_VIEWS = 10;

type AlertKind = 'spike' | 'not-found' | 'drop';

const lastAlertAt = new Map<string, number>();
let alertTimer: ReturnType<typeof setInterval> | null = null;
let running = false;

function alertsEnabled(): boolean {
	return (env.ANALYTICS_ALERTS_ENABLED ?? 'true') !== 'false';
}

function cooldownFor(kind: AlertKind): number {
	return kind === 'drop' ? DROP_COOLDOWN_MS : SPIKE_COOLDOWN_MS;
}

function shouldSend(websiteId: string, kind: AlertKind, now: number): boolean {
	const key = `${websiteId}:${kind}`;
	const last = lastAlertAt.get(key) ?? 0;
	if (now - last < cooldownFor(kind)) return false;
	lastAlertAt.set(key, now);
	return true;
}

function reportUrl(websiteId: string): string {
	const base = env.PUBLIC_BASE_URL ?? 'http://localhost:5173';
	return `${base.replace(/\/$/, '')}/websites/${websiteId}/analytics`;
}

function hoursAgo(hours: number, from = Date.now()): Date {
	return new Date(from - hours * 60 * 60 * 1000);
}

async function countEvents(
	websiteId: string,
	type: string,
	since: Date,
	until?: Date
): Promise<number> {
	const conditions = [
		eq(analyticsEvents.websiteId, websiteId),
		eq(analyticsEvents.type, type),
		gte(analyticsEvents.createdAt, since)
	];
	if (until) conditions.push(lt(analyticsEvents.createdAt, until));

	const [row] = await db
		.select({ value: count() })
		.from(analyticsEvents)
		.where(and(...conditions));

	return Number(row?.value ?? 0);
}

async function topMissingPath(websiteId: string, since: Date): Promise<string | null> {
	const [row] = await db
		.select({ path: analyticsEvents.path, value: count() })
		.from(analyticsEvents)
		.where(
			and(
				eq(analyticsEvents.websiteId, websiteId),
				eq(analyticsEvents.type, 'not_found'),
				gte(analyticsEvents.createdAt, since)
			)
		)
		.groupBy(analyticsEvents.path)
		.orderBy(desc(count()))
		.limit(1);

	return row?.path ?? null;
}

interface AlertCandidate {
	kind: AlertKind;
	siteName: string;
	slackId: string | null;
	details: {
		pageviews?: number;
		baseline?: number;
		notFound?: number;
		topPath?: string | null;
		priorViews?: number;
	};
}

async function inspectSite(site: {
	id: string;
	name: string;
	createdBy: string | null;
	slackId: string | null;
	notify: boolean;
}): Promise<AlertCandidate[]> {
	const now = Date.now();
	const hourAgo = hoursAgo(1, now);
	const dayAgo = hoursAgo(24, now);
	const weekAgo = hoursAgo(24 * 7, now);

	const [lastHour, priorWeek, lastDay, priorWeekBeforeDay] = await Promise.all([
		countEvents(site.id, 'pageview', hourAgo),
		countEvents(site.id, 'pageview', weekAgo, hourAgo),
		countEvents(site.id, 'pageview', dayAgo),
		countEvents(site.id, 'pageview', hoursAgo(24 * 8, now), dayAgo)
	]);

	const candidates: AlertCandidate[] = [];
	const hourlyBaseline = priorWeek / (24 * 7 - 1);

	if (lastHour >= Math.max(MIN_SPIKE_VIEWS, hourlyBaseline * SPIKE_FACTOR)) {
		candidates.push({
			kind: 'spike',
			siteName: site.name,
			slackId: site.slackId,
			details: { pageviews: lastHour, baseline: Math.round(hourlyBaseline * 10) / 10 }
		});
	}

	const notFoundLastHour = await countEvents(site.id, 'not_found', hourAgo);
	const notFoundBaseline = (await countEvents(site.id, 'not_found', weekAgo, hourAgo)) / (24 * 7 - 1);
	if (
		notFoundLastHour >= Math.max(MIN_NOT_FOUND, notFoundBaseline * NOT_FOUND_FACTOR) &&
		notFoundLastHour > 0
	) {
		candidates.push({
			kind: 'not-found',
			siteName: site.name,
			slackId: site.slackId,
			details: {
				notFound: notFoundLastHour,
				topPath: await topMissingPath(site.id, hourAgo)
			}
		});
	}

	// A site that had traffic and then went completely quiet for a day usually
	// means the last deploy broke it, not that people lost interest.
	if (lastDay === 0 && priorWeekBeforeDay >= DROP_MIN_PRIOR_VIEWS) {
		candidates.push({
			kind: 'drop',
			siteName: site.name,
			slackId: site.slackId,
			details: { priorViews: priorWeekBeforeDay }
		});
	}

	return site.notify ? candidates : [];
}

export async function runAnalyticsAlertCheck(now = Date.now()): Promise<number> {
	if (!alertsEnabled()) return 0;

	const rows = await db
		.select({
			id: websites.id,
			name: websites.name,
			createdBy: websites.createdBy,
			slackId: users.slackId,
			notify: users.slackNotificationsEnabled
		})
		.from(websites)
		.leftJoin(users, eq(websites.createdBy, users.id))
		.where(eq(websites.status, 'ACTIVE'));

	const notifier = createSlackNotifier();
	let sent = 0;

	for (const row of rows) {
		const site = {
			id: row.id,
			name: row.name,
			createdBy: row.createdBy,
			slackId: row.slackId ?? null,
			notify: row.notify ?? false
		};

		let candidates: AlertCandidate[] = [];
		try {
			candidates = await inspectSite(site);
		} catch (err) {
			console.error(`[analytics] Alert check failed for ${site.name}:`, err);
			continue;
		}

		for (const candidate of candidates) {
			if (!candidate.slackId || !shouldSend(site.id, candidate.kind, now)) continue;

			if (candidate.kind === 'spike') {
				await notifyTrafficSpike(
					notifier,
					candidate.slackId,
					candidate.siteName,
					candidate.details.pageviews ?? 0,
					candidate.details.baseline ?? 0,
					reportUrl(site.id)
				);
			} else if (candidate.kind === 'not-found') {
				await notifyErrorSpike(
					notifier,
					candidate.slackId,
					candidate.siteName,
					candidate.details.notFound ?? 0,
					candidate.details.topPath ?? null,
					reportUrl(site.id)
				);
			} else {
				await notifyTrafficDrop(
					notifier,
					candidate.slackId,
					candidate.siteName,
					candidate.details.priorViews ?? 0,
					reportUrl(site.id)
				);
			}

			sent += 1;
		}
	}

	return sent;
}

export function startAnalyticsAlerts(): void {
	if (alertTimer || !alertsEnabled()) return;

	const tick = () => {
		if (running) return;
		running = true;
		runAnalyticsAlertCheck()
			.then((sent) => {
				if (sent > 0) console.log(`[analytics] Sent ${sent} alert(s)`);
			})
			.catch((err) => console.error('[analytics] Alert check failed:', err))
			.finally(() => {
				running = false;
			});
	};

	alertTimer = setInterval(tick, CHECK_INTERVAL_MS);
	alertTimer.unref?.();
}

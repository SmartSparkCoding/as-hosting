import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	gte,
	inArray,
	isNotNull,
	lt,
	sql
} from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { analyticsEvents } from '../db/schema';
import {
	classifyReferrer,
	getCollectionBlockReason,
	hashVisitor,
	parseUserAgent,
	normaliseCountry,
	parseAcceptLanguage,
	parseUtm
} from '../analytics/collect';
import type { CollectContext } from '../analytics/collect';

export const ANALYTICS_TIMEZONE = 'Europe/London';

export function getRetentionDays(): number {
	const raw = Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS ?? '', 10);
	if (!Number.isFinite(raw) || raw < 7) return 90;
	return Math.min(raw, 365);
}

export type AnalyticsEventType = 'pageview' | 'engagement' | 'outbound' | 'download' | 'not_found';

export interface AnalyticsEventInput {
	websiteId: string;
	type: AnalyticsEventType;
	path: string;
	ctx: CollectContext;
	utm?: ReturnType<typeof parseUtm> | null;
	screenWidth?: number | null;
	screenHeight?: number | null;
	durationSeconds?: number | null;
	scrollDepth?: number | null;
	targetHost?: string | null;
	referer?: string | null;
}

/**
 * Writes one analytics row. Returns false when the request must not be counted
 * (opt-out header, bot, prefetch, ...). Callers should fire-and-forget this so
 * serving a hosted page never waits on analytics.
 */
export async function recordAnalyticsEvent(input: AnalyticsEventInput): Promise<boolean> {
	if (getCollectionBlockReason(input.ctx)) return false;

	const agent = parseUserAgent(input.ctx.userAgent);
	const referrer = classifyReferrer(
		input.referer ?? input.ctx.referer,
		input.ctx.host
	);
	const utm = input.utm ?? null;

	await db.insert(analyticsEvents).values({
		websiteId: input.websiteId,
		type: input.type,
		path: input.path,
		host: input.ctx.host ? input.ctx.host.slice(0, 255) : null,
		referrerHost: referrer.referrerHost,
		referrerType: referrer.referrerType,
		utmSource: utm?.utmSource ?? null,
		utmMedium: utm?.utmMedium ?? null,
		utmCampaign: utm?.utmCampaign ?? null,
		country: normaliseCountry(input.ctx.country),
		language: parseAcceptLanguage(input.ctx.language),
		browser: agent.browser,
		browserVersion: agent.browserVersion,
		os: agent.os,
		device: agent.device,
		visitorHash: hashVisitor(input.ctx.ip, input.ctx.userAgent),
		screenWidth: input.screenWidth ?? null,
		screenHeight: input.screenHeight ?? null,
		durationSeconds: input.durationSeconds ?? null,
		scrollDepth: input.scrollDepth ?? null,
		targetHost: input.targetHost ? input.targetHost.slice(0, 255) : null
	});

	return true;
}

/* -------------------------------------------------------------------------- */
/* Aggregations                                                               */
/* -------------------------------------------------------------------------- */

export interface AnalyticsTotals {
	pageviews: number;
	visitors: number;
	visits: number;
	bounces: number;
	bounceRate: number;
	averageEngagementSeconds: number;
	outboundClicks: number;
	downloads: number;
	notFound: number;
}

export interface SeriesPoint {
	day: string;
	pageviews: number;
	visitors: number;
}

export interface PathRow {
	path: string;
	pageviews: number;
	visitors: number;
	averageEngagementSeconds: number | null;
}

export interface ReferrerRow {
	referrerHost: string;
	referrerType: string;
	pageviews: number;
	visitors: number;
}

export interface LabelledCount {
	label: string;
	value: number;
}

export interface HeatmapCell {
	dow: number;
	hour: number;
	pageviews: number;
}

export interface AnalyticsReport {
	days: number;
	from: string;
	totals: AnalyticsTotals;
	series: SeriesPoint[];
	topPages: PathRow[];
	referrers: ReferrerRow[];
	channels: LabelledCount[];
	devices: LabelledCount[];
	browsers: LabelledCount[];
	operatingSystems: LabelledCount[];
	countries: LabelledCount[];
	languages: LabelledCount[];
	utmCampaigns: LabelledCount[];
	heatmap: HeatmapCell[];
}

function startOfRange(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function numberValue(value: unknown): number {
	if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
	if (typeof value === 'bigint') return Number(value);
	if (typeof value === 'string') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : 0;
	}
	return 0;
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
	if (!result) return undefined;
	const rows = (result as { rows?: unknown }).rows ?? result;
	if (!Array.isArray(rows)) return undefined;
	return rows[0] as Record<string, unknown> | undefined;
}

function dayKeys(days: number): string[] {
	const today = formatDay(new Date());
	const [year, month, day] = today.split('-').map(Number);
	const keys: string[] = [];

	for (let offset = days - 1; offset >= 0; offset -= 1) {
		const date = new Date(Date.UTC(year, month - 1, day - offset));
		keys.push(date.toISOString().slice(0, 10));
	}

	return keys;
}

function formatDay(date: Date): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: ANALYTICS_TIMEZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(date);
}

async function loadTotals(websiteId: string, since: Date): Promise<AnalyticsTotals> {
	// `db.execute` passes values straight to postgres.js, which cannot bind Date
	// objects, so the raw CTE below takes an explicit timestamptz string.
	const sinceIso = since.toISOString();

	const pageviewWhere = and(
		eq(analyticsEvents.websiteId, websiteId),
		eq(analyticsEvents.type, 'pageview'),
		gte(analyticsEvents.createdAt, since)
	);

	const [pageviews, engagement, extras, session] = await Promise.all([
		db
			.select({
				pageviews: count(),
				visitors: countDistinct(analyticsEvents.visitorHash)
			})
			.from(analyticsEvents)
			.where(pageviewWhere),
		db
			.select({
				totalSeconds: sql<number>`coalesce(sum(${analyticsEvents.durationSeconds}), 0)::int`,
				samples: sql<number>`count(*)::int`
			})
			.from(analyticsEvents)
			.where(
				and(
					eq(analyticsEvents.websiteId, websiteId),
					eq(analyticsEvents.type, 'engagement'),
					gte(analyticsEvents.createdAt, since),
					isNotNull(analyticsEvents.durationSeconds)
				)
			),
		db
			.select({
				downloads: sql<number>`count(*) filter (where ${analyticsEvents.type} = 'download')::int`,
				outboundClicks: sql<number>`count(*) filter (where ${analyticsEvents.type} = 'outbound')::int`,
				notFound: sql<number>`count(*) filter (where ${analyticsEvents.type} = 'not_found')::int`
			})
			.from(analyticsEvents)
			.where(
				and(
					eq(analyticsEvents.websiteId, websiteId),
					gte(analyticsEvents.createdAt, since),
					inArray(analyticsEvents.type, ['download', 'outbound', 'not_found'])
				)
			),
		db.execute(sql`
			with pageviews as (
				select visitor_hash, created_at,
					lag(created_at) over (partition by visitor_hash order by created_at) as previous_at
				from ${analyticsEvents}
				where ${analyticsEvents.websiteId} = ${websiteId}
					and ${analyticsEvents.type} = 'pageview'
					and ${analyticsEvents.createdAt} >= ${sinceIso}::timestamptz
					and ${analyticsEvents.visitorHash} is not null
			),
			marked as (
				select visitor_hash, created_at,
					case
						when previous_at is null or created_at - previous_at > interval '30 minutes' then 1
						else 0
					end as starts_session
				from pageviews
			),
			sessions as (
				select visitor_hash, created_at,
					sum(starts_session) over (partition by visitor_hash order by created_at) as session_id
				from marked
			)
			select count(*)::int as visits,
				count(*) filter (where pageview_count = 1)::int as bounces
			from (
				select visitor_hash, session_id, count(*) as pageview_count
				from sessions
				group by visitor_hash, session_id
			) per_session
		`)
	]);

	const sessionRow = firstRow(session);
	const visits = numberValue(sessionRow?.visits);
	const bounces = numberValue(sessionRow?.bounces);
	const samples = numberValue(engagement[0]?.samples);
	const totalSeconds = numberValue(engagement[0]?.totalSeconds);

	return {
		pageviews: numberValue(pageviews[0]?.pageviews),
		visitors: numberValue(pageviews[0]?.visitors),
		visits,
		bounces,
		bounceRate: visits > 0 ? Math.round((bounces / visits) * 1000) / 10 : 0,
		averageEngagementSeconds: samples > 0 ? Math.round(totalSeconds / samples) : 0,
		outboundClicks: numberValue(extras[0]?.outboundClicks),
		downloads: numberValue(extras[0]?.downloads),
		notFound: numberValue(extras[0]?.notFound)
	};
}

async function loadSeries(websiteId: string, since: Date, days: number): Promise<SeriesPoint[]> {
	const rows = await db
		.select({
			day: sql<string>`to_char(${analyticsEvents.createdAt} at time zone ${ANALYTICS_TIMEZONE}, 'YYYY-MM-DD')`,
			pageviews: count(),
			visitors: countDistinct(analyticsEvents.visitorHash)
		})
		.from(analyticsEvents)
		.where(
			and(
				eq(analyticsEvents.websiteId, websiteId),
				eq(analyticsEvents.type, 'pageview'),
				gte(analyticsEvents.createdAt, since)
			)
		)
		.groupBy(sql`1`)
		.orderBy(sql`1`);

	const byDay = new Map(rows.map((row) => [row.day, row]));

	return dayKeys(days).map((day) => ({
		day,
		pageviews: numberValue(byDay.get(day)?.pageviews),
		visitors: numberValue(byDay.get(day)?.visitors)
	}));
}

async function groupCounts(
	websiteId: string,
	since: Date,
	column: PgColumn,
	limit: number
): Promise<LabelledCount[]> {
	const rows = await db
		.select({ label: column, value: count() })
		.from(analyticsEvents)
		.where(
			and(
				eq(analyticsEvents.websiteId, websiteId),
				eq(analyticsEvents.type, 'pageview'),
				gte(analyticsEvents.createdAt, since),
				isNotNull(column)
			)
		)
		.groupBy(column)
		.orderBy(desc(count()))
		.limit(limit);

	return rows
		.filter((row) => row.label)
		.map((row) => ({ label: String(row.label), value: numberValue(row.value) }));
}

export async function getWebsiteAnalytics(
	websiteId: string,
	days = 30
): Promise<AnalyticsReport> {
	const since = startOfRange(days);

	const [
		totals,
		series,
		pageviewPaths,
		engagementPaths,
		referrerRows,
		channelRows,
		devices,
		browsers,
		operatingSystems,
		countries,
		languages,
		utmCampaigns,
		heatmapRows
	] = await Promise.all([
		loadTotals(websiteId, since),
		loadSeries(websiteId, since, days),
		db
			.select({
				path: analyticsEvents.path,
				pageviews: count(),
				visitors: countDistinct(analyticsEvents.visitorHash)
			})
			.from(analyticsEvents)
			.where(
				and(
					eq(analyticsEvents.websiteId, websiteId),
					eq(analyticsEvents.type, 'pageview'),
					gte(analyticsEvents.createdAt, since)
				)
			)
			.groupBy(analyticsEvents.path)
			.orderBy(desc(count()))
			.limit(12),
		db
			.select({
				path: analyticsEvents.path,
				averageEngagementSeconds: sql<number>`round(avg(${analyticsEvents.durationSeconds}))::int`
			})
			.from(analyticsEvents)
			.where(
				and(
					eq(analyticsEvents.websiteId, websiteId),
					eq(analyticsEvents.type, 'engagement'),
					gte(analyticsEvents.createdAt, since),
					isNotNull(analyticsEvents.durationSeconds)
				)
			)
			.groupBy(analyticsEvents.path),
		db
			.select({
				referrerHost: analyticsEvents.referrerHost,
				referrerType: analyticsEvents.referrerType,
				pageviews: count(),
				visitors: countDistinct(analyticsEvents.visitorHash)
			})
			.from(analyticsEvents)
			.where(
				and(
					eq(analyticsEvents.websiteId, websiteId),
					eq(analyticsEvents.type, 'pageview'),
					gte(analyticsEvents.createdAt, since),
					isNotNull(analyticsEvents.referrerHost)
				)
			)
			.groupBy(analyticsEvents.referrerHost, analyticsEvents.referrerType)
			.orderBy(desc(count()))
			.limit(12),
		db
			.select({ label: analyticsEvents.referrerType, value: count() })
			.from(analyticsEvents)
			.where(
				and(
					eq(analyticsEvents.websiteId, websiteId),
					eq(analyticsEvents.type, 'pageview'),
					gte(analyticsEvents.createdAt, since)
				)
			)
			.groupBy(analyticsEvents.referrerType)
			.orderBy(desc(count())),
		groupCounts(websiteId, since, analyticsEvents.device, 6),
		groupCounts(websiteId, since, analyticsEvents.browser, 8),
		groupCounts(websiteId, since, analyticsEvents.os, 8),
		groupCounts(websiteId, since, analyticsEvents.country, 15),
		groupCounts(websiteId, since, analyticsEvents.language, 8),
		groupCounts(websiteId, since, analyticsEvents.utmCampaign, 8),
		db
			.select({
				dow: sql<number>`extract(dow from ${analyticsEvents.createdAt} at time zone ${ANALYTICS_TIMEZONE})::int`,
				hour: sql<number>`extract(hour from ${analyticsEvents.createdAt} at time zone ${ANALYTICS_TIMEZONE})::int`,
				pageviews: count()
			})
			.from(analyticsEvents)
			.where(
				and(
					eq(analyticsEvents.websiteId, websiteId),
					eq(analyticsEvents.type, 'pageview'),
					gte(analyticsEvents.createdAt, since)
				)
			)
			.groupBy(sql`1`, sql`2`)
	]);

	const engagementByPath = new Map(
		engagementPaths.map((row) => [row.path, numberValue(row.averageEngagementSeconds)])
	);

	return {
		days,
		from: dayKeys(days)[0],
		totals,
		series,
		topPages: pageviewPaths.map((row) => ({
			path: row.path,
			pageviews: numberValue(row.pageviews),
			visitors: numberValue(row.visitors),
			averageEngagementSeconds: engagementByPath.get(row.path) ?? null
		})),
		referrers: referrerRows
			.filter((row) => row.referrerHost)
			.map((row) => ({
				referrerHost: String(row.referrerHost),
				referrerType: row.referrerType ?? 'referral',
				pageviews: numberValue(row.pageviews),
				visitors: numberValue(row.visitors)
			})),
		channels: channelRows.map((row) => ({
			label: row.label ?? 'direct',
			value: numberValue(row.value)
		})),
		devices,
		browsers,
		operatingSystems,
		countries,
		languages,
		utmCampaigns,
		heatmap: heatmapRows.map((row) => ({
			dow: numberValue(row.dow),
			hour: numberValue(row.hour),
			pageviews: numberValue(row.pageviews)
		}))
	};
}

export interface AnalyticsHighlight {
	pageviews: number;
	visitors: number;
	averageEngagementSeconds: number;
	notFound: number;
	series: SeriesPoint[];
}

export function emptyAnalyticsHighlight(days = 7): AnalyticsHighlight {
	return {
		pageviews: 0,
		visitors: 0,
		averageEngagementSeconds: 0,
		notFound: 0,
		series: dayKeys(days).map((day) => ({ day, pageviews: 0, visitors: 0 }))
	};
}

export async function getWebsiteAnalyticsHighlights(
	websiteId: string,
	days = 7
): Promise<AnalyticsHighlight> {
	const since = startOfRange(days);
	const [totals, series] = await Promise.all([
		loadTotals(websiteId, since),
		loadSeries(websiteId, since, days)
	]);

	return {
		pageviews: totals.pageviews,
		visitors: totals.visitors,
		averageEngagementSeconds: totals.averageEngagementSeconds,
		notFound: totals.notFound,
		series
	};
}

export interface AnalyticsSummary {
	pageviews: number;
	visitors: number;
}

export async function getAnalyticsSummaries(
	websiteIds: string[],
	days = 7
): Promise<Record<string, AnalyticsSummary>> {
	if (websiteIds.length === 0) return {};

	const rows = await db
		.select({
			websiteId: analyticsEvents.websiteId,
			pageviews: count(),
			visitors: countDistinct(analyticsEvents.visitorHash)
		})
		.from(analyticsEvents)
		.where(
			and(
				inArray(analyticsEvents.websiteId, websiteIds),
				eq(analyticsEvents.type, 'pageview'),
				gte(analyticsEvents.createdAt, startOfRange(days))
			)
		)
		.groupBy(analyticsEvents.websiteId);

	const summary: Record<string, AnalyticsSummary> = {};
	for (const id of websiteIds) {
		summary[id] = { pageviews: 0, visitors: 0 };
	}
	for (const row of rows) {
		summary[row.websiteId] = {
			pageviews: numberValue(row.pageviews),
			visitors: numberValue(row.visitors)
		};
	}

	return summary;
}

export async function pruneAnalyticsEvents(): Promise<number> {
	const cutoff = new Date(Date.now() - getRetentionDays() * 24 * 60 * 60 * 1000);
	const deleted = await db
		.delete(analyticsEvents)
		.where(lt(analyticsEvents.createdAt, cutoff))
		.returning({ id: analyticsEvents.id });
	return deleted.length;
}

let retentionTimer: ReturnType<typeof setInterval> | null = null;

export function startAnalyticsRetention(): void {
	if (retentionTimer) return;

	pruneAnalyticsEvents()
		.then((count) => {
			if (count > 0) console.log(`[analytics] Pruned ${count} event(s) past retention`);
		})
		.catch((err) => console.error('[analytics] Retention prune failed:', err));

	retentionTimer = setInterval(
		() => {
			pruneAnalyticsEvents().catch((err) =>
				console.error('[analytics] Retention prune failed:', err)
			);
		},
		6 * 60 * 60 * 1000
	);
	retentionTimer.unref?.();
}

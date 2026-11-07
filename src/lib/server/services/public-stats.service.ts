import { and, count, countDistinct, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../db';
import { analyticsEvents } from '../db/schema';
import { getPublicStatsWebsites } from './website.service';
import { ANALYTICS_TIMEZONE } from './analytics.service';

/**
 * Aggregates for the public /stats page.
 *
 * Only site-level totals leave this module: no paths, referrers, countries or
 * anything else that could describe an individual visitor. Sites that are
 * unlisted, password protected or opted out are excluded before any query runs.
 */

export interface PublicStatsTotals {
	pageviews: number;
	visitors: number;
}

export interface PublicSiteStats {
	id: string;
	name: string;
	slug: string;
	weekPageviews: number;
	weekVisitors: number;
	monthPageviews: number;
	monthVisitors: number;
}

export interface PublicStatsSeriesPoint {
	day: string;
	pageviews: number;
	visitors: number;
}

export interface PublicStats {
	generatedAt: string;
	week: PublicStatsTotals;
	month: PublicStatsTotals;
	sites: PublicSiteStats[];
	series: PublicStatsSeriesPoint[];
	/** Sites with at least one pageview in the last week, busiest first. */
	activeSites: number;
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

function sinceDays(days: number): Date {
	return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

async function totalsBySite(ids: string[], since: Date) {
	const rows = await db
		.select({
			websiteId: analyticsEvents.websiteId,
			pageviews: count(),
			visitors: countDistinct(analyticsEvents.visitorHash)
		})
		.from(analyticsEvents)
		.where(
			and(
				inArray(analyticsEvents.websiteId, ids),
				eq(analyticsEvents.type, 'pageview'),
				gte(analyticsEvents.createdAt, since)
			)
		)
		.groupBy(analyticsEvents.websiteId);

	return new Map(
		rows.map((row) => [
			row.websiteId,
			{ pageviews: numberValue(row.pageviews), visitors: numberValue(row.visitors) }
		])
	);
}

async function seriesSince(since: Date): Promise<PublicStatsSeriesPoint[]> {
	const rows = await db
		.select({
			day: sql<string>`to_char(${analyticsEvents.createdAt} at time zone ${ANALYTICS_TIMEZONE}, 'YYYY-MM-DD')`,
			pageviews: count(),
			visitors: countDistinct(analyticsEvents.visitorHash)
		})
		.from(analyticsEvents)
		.where(
			and(
				eq(analyticsEvents.type, 'pageview'),
				gte(analyticsEvents.createdAt, since)
			)
		)
		.groupBy(sql`1`)
		.orderBy(sql`1`);

	return rows.map((row) => ({
		day: row.day,
		pageviews: numberValue(row.pageviews),
		visitors: numberValue(row.visitors)
	}));
}

export async function getPublicStats(): Promise<PublicStats> {
	const generatedAt = new Date().toISOString();
	const sites = await getPublicStatsWebsites();

	if (sites.length === 0) {
		return {
			generatedAt,
			week: { pageviews: 0, visitors: 0 },
			month: { pageviews: 0, visitors: 0 },
			sites: [],
			series: [],
			activeSites: 0
		};
	}

	const ids = sites.map((site) => site.id);
	const [weekRows, monthRows, series] = await Promise.all([
		totalsBySite(ids, sinceDays(7)),
		totalsBySite(ids, sinceDays(30)),
		seriesSince(sinceDays(30))
	]);

	const siteStats: PublicSiteStats[] = sites.map((site) => {
		const week = weekRows.get(site.id);
		const month = monthRows.get(site.id);
		return {
			id: site.id,
			name: site.name,
			slug: site.slug,
			weekPageviews: week?.pageviews ?? 0,
			weekVisitors: week?.visitors ?? 0,
			monthPageviews: month?.pageviews ?? 0,
			monthVisitors: month?.visitors ?? 0
		};
	});

	siteStats.sort(
		(a, b) => b.weekPageviews - a.weekPageviews || a.name.localeCompare(b.name)
	);

	const week = {
		pageviews: siteStats.reduce((sum, site) => sum + site.weekPageviews, 0),
		// Visitors are per site, so this is the sum of unique visitors, not club-wide uniques.
		visitors: siteStats.reduce((sum, site) => sum + site.weekVisitors, 0)
	};
	const month = {
		pageviews: siteStats.reduce((sum, site) => sum + site.monthPageviews, 0),
		visitors: siteStats.reduce((sum, site) => sum + site.monthVisitors, 0)
	};

	return {
		generatedAt,
		week,
		month,
		sites: siteStats,
		series,
		activeSites: siteStats.filter((site) => site.weekPageviews > 0).length
	};
}

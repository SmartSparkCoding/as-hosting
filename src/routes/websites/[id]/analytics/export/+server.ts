import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWebsiteById } from '$lib/server/services/website.service';
import { getWebsiteAnalytics } from '$lib/server/services/analytics.service';
import { hasPermission, Permission } from '$lib/permissions';
import { parseAnalyticsRange } from '$lib/analytics';

function csvCell(value: string | number): string {
	const text = String(value);
	if (/[",\n\r]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/login');

	if (!hasPermission(locals.user.role, Permission.VIEW_WEBSITE, locals.user.ambassadorPermission)) {
		throw error(403, 'Permission denied');
	}

	const website = await getWebsiteById(params.id);
	if (!website) throw error(404, 'Website not found');

	const days = parseAnalyticsRange(url.searchParams.get('range'));
	const report = await getWebsiteAnalytics(website.id, days);

	const lines = [
		'day,pageviews,visitors',
		...report.series.map((point) =>
			[point.day, point.pageviews, point.visitors].map(csvCell).join(',')
		),
		'',
		`# ${website.slug} analytics export (${days} days, ${report.from} onwards)`,
		`# totals,${report.totals.pageviews},${report.totals.visitors},${report.totals.visits},${report.totals.bounceRate},${report.totals.averageEngagementSeconds},${report.totals.outboundClicks},${report.totals.downloads},${report.totals.notFound}`
	];

	return new Response(lines.join('\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="${website.slug}-analytics-${days}d.csv"`,
			'Cache-Control': 'no-store'
		}
	});
};

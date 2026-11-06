import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAllWebsites, getStorageStats } from '$lib/server/services/website.service';
import { getAnalyticsSummaries } from '$lib/server/services/analytics.service';
import { getAuditLogs } from '$lib/server/services/audit.service';
import { getRoleStats } from '$lib/server/services/user.service';
import { formatBytes } from '$lib/utils';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const [websites, storageStats, auditLogs, roleStats] = await Promise.all([
		getAllWebsites(),
		getStorageStats(),
		getAuditLogs(10),
		getRoleStats()
	]);

	const analytics = await getAnalyticsSummaries(
		websites.map((website) => website.id),
		7
	).catch((err) => {
		console.error('[analytics] Could not load dashboard summaries:', err);
		return {} as Record<string, { pageviews: number; visitors: number }>;
	});
	const totalViews = Object.values(analytics).reduce((sum, site) => sum + site.pageviews, 0);

	const activeCount = websites.filter((w) => w.status === 'ACTIVE').length;
	const archivedCount = websites.filter((w) => w.status === 'ARCHIVED').length;

	return {
		websites,
		analytics,
		stats: {
			active: activeCount,
			archived: archivedCount,
			total: websites.length,
			storage: formatBytes(storageStats.totalBytes),
			views: totalViews
		},
		auditLogs,
		roleStats,
		baseUrl: process.env.PUBLIC_BASE_URL || 'http://localhost:5173'
	};
};

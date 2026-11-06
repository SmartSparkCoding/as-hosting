import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getAllWebsites, getStorageStats } from '$lib/server/services/website.service';
import { getAnalyticsSummaries } from '$lib/server/services/analytics.service';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const [websites, storageStats] = await Promise.all([
		getAllWebsites(),
		getStorageStats()
	]);

	const analytics = await getAnalyticsSummaries(
		websites.map((website) => website.id),
		7
	).catch((err) => {
		console.error('[analytics] Could not load website summaries:', err);
		return {} as Record<string, { pageviews: number; visitors: number }>;
	});

	return { websites, storage: storageStats, analytics };
};

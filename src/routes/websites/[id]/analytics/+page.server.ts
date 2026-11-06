import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getWebsiteById } from '$lib/server/services/website.service';
import { getWebsiteAnalytics } from '$lib/server/services/analytics.service';
import { hasPermission, Permission } from '$lib/permissions';
import { parseAnalyticsRange, ANALYTICS_RANGES } from '$lib/analytics';

export const load: PageServerLoad = async ({ locals, params, url }) => {
	if (!locals.user) throw redirect(302, '/login');

	if (!hasPermission(locals.user.role, Permission.VIEW_WEBSITE, locals.user.ambassadorPermission)) {
		throw error(403, 'Permission denied');
	}

	const website = await getWebsiteById(params.id);
	if (!website) throw error(404, 'Website not found');

	const days = parseAnalyticsRange(url.searchParams.get('range'));
	const report = await getWebsiteAnalytics(website.id, days);
	const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';

	return {
		website,
		report,
		days,
		ranges: ANALYTICS_RANGES,
		publicUrl: `${baseUrl}/${website.slug}/`
	};
};

import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWebsiteById } from '$lib/server/services/website.service';
import { getLiveVisitors } from '$lib/server/services/analytics.service';
import { hasPermission, Permission } from '$lib/permissions';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');

	if (!hasPermission(locals.user.role, Permission.VIEW_WEBSITE, locals.user.ambassadorPermission)) {
		throw error(403, 'Permission denied');
	}

	const website = await getWebsiteById(params.id);
	if (!website) throw error(404, 'Website not found');

	const live = await getLiveVisitors(website.id, 5);

	return new Response(JSON.stringify(live), {
		headers: {
			'Content-Type': 'application/json',
			'Cache-Control': 'no-store'
		}
	});
};

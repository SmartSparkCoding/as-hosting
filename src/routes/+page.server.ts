import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { CLUB_NAME, PRODUCT_NAME, TAGLINE } from '$lib/constants';
import { getPublicStats } from '$lib/server/services/public-stats.service';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/dashboard');
	}

	// The landing page shows the same public numbers as /stats, so a dead
	// database degrades to a page without numbers instead of an error page.
	const stats = await getPublicStats().catch(() => null);

	return {
		clubName: CLUB_NAME,
		productName: PRODUCT_NAME,
		tagline: TAGLINE,
		stats
	};
};

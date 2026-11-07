import type { PageServerLoad } from './$types';
import { getPublicStats } from '$lib/server/services/public-stats.service';
import { CLUB_NAME } from '$lib/constants';

// Readable numbers for anyone in the club, no sign-in required. Only site-level
// totals are exposed; per-page and per-visitor detail stays behind the login.
export const load: PageServerLoad = async () => {
	const stats = await getPublicStats().catch((err) => {
		console.error('[stats] Failed to build public stats:', err);
		return null;
	});

	return {
		clubName: CLUB_NAME,
		stats
	};
};

import { fail, redirect } from '@sveltejs/kit';
import { Permission, hasPermission } from '$lib/permissions';
import {
	MIN_QUERY_LENGTH,
	getIndexStats,
	reindexAll,
	searchSites,
	type IndexStats,
	type SearchHit,
} from '$lib/server/services/search.service';

const EMPTY_STATS: IndexStats = { pages: 0, sites: 0, lastIndexedAt: null };

export async function load({ locals, url }) {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const query = (url.searchParams.get('q') ?? '').trim();
	const searchable = query.length >= MIN_QUERY_LENGTH;

	const [results, stats] = await Promise.all([
		searchable ? searchSites(query).catch(() => [] as SearchHit[]) : Promise.resolve([]),
		getIndexStats().catch(() => EMPTY_STATS),
	]);

	return { query, results, stats, minQueryLength: MIN_QUERY_LENGTH };
}

export const actions = {
	reindex: async ({ locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Not authenticated' });
		}
		if (
			!hasPermission(
				locals.user.role,
				Permission.EDIT_WEBSITE,
				locals.user.ambassadorPermission ?? undefined,
			)
		) {
			return fail(403, { error: 'Permission denied' });
		}

		try {
			const summary = await reindexAll();
			return { success: true, summary };
		} catch {
			return fail(500, { error: 'The index could not be rebuilt.' });
		}
	},
};

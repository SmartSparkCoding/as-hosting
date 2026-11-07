import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { checkSlugExists } from '$lib/server/services/website.service';
import type { SiteVisibility } from '$lib/server/services/website.service';
import {
	createGroup,
	getAllGroups,
	getGroupBySlug,
	getTakenSlugs
} from '$lib/server/services/group.service';
import { provisionWebsite } from '$lib/server/services/site-provision.service';
import { normalizeSlug, isValidSlug } from '$lib/utils';
import { hasPermission, Permission } from '$lib/permissions';
import { logAudit, AuditAction } from '$lib/server/services/audit.service';
import { hashPassword } from '$lib/server/auth/password';
import { RESERVED_SLUGS } from '$lib/constants';
import { normalizeGitUrl, parseGitHubRepo } from '$lib/server/hosting/git-url';
import {
	BULK_CONCURRENCY,
	MAX_BULK_REPOS,
	mapWithConcurrency,
	nameFromRepo,
	parseRepoLines,
	slugFromRepo,
	uniqueSlug
} from '$lib/server/hosting/bulk-plan';

const VISIBILITIES: SiteVisibility[] = ['PUBLIC', 'UNLISTED', 'PASSWORD'];

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!hasPermission(locals.user.role, Permission.CREATE_WEBSITE, locals.user.ambassadorPermission)) {
		throw redirect(302, '/dashboard');
	}

	const groups = await getAllGroups().catch(() => []);

	return {
		groups: groups.map((group) => ({ name: group.name, slug: group.slug })),
		maxBulk: MAX_BULK_REPOS
	};
};

/** Shared by both forms: read the visibility controls and hash the password if needed. */
async function readVisibility(formData: FormData): Promise<
	| { ok: true; visibility: SiteVisibility; passwordHash: string | null; showInPublicStats: boolean }
	| { ok: false; error: string }
> {
	const visibility = String(formData.get('visibility') ?? 'PUBLIC') as SiteVisibility;
	const password = String(formData.get('accessPassword') ?? '');
	const showInPublicStats = formData.get('showInPublicStats') === 'on';

	if (!VISIBILITIES.includes(visibility)) {
		return { ok: false, error: 'Unknown visibility option' };
	}

	if (visibility === 'PASSWORD') {
		if (password.length < 6) {
			return { ok: false, error: 'Use at least 6 characters for the site password' };
		}
		return {
			ok: true,
			visibility,
			passwordHash: await hashPassword(password),
			showInPublicStats: false
		};
	}

	return { ok: true, visibility, passwordHash: null, showInPublicStats };
}

export const actions: Actions = {
	single: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.CREATE_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const name = (formData.get('name') as string)?.trim();
		const gitUrl = (formData.get('gitUrl') as string)?.trim();
		const rawSlug = (formData.get('slug') as string)?.trim();

		if (!name) return fail(400, { error: 'Website name is required' });
		if (!gitUrl) return fail(400, { error: 'Git repository URL is required' });
		if (!gitUrl.startsWith('https://')) return fail(400, { error: 'Please use an HTTPS Git URL' });
		let parsedGitUrl: string;
		try {
			parsedGitUrl = normalizeGitUrl(gitUrl);
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'That repository URL is not supported'
			});
		}

		const slug = rawSlug ? normalizeSlug(rawSlug) : normalizeSlug(name);
		if (!slug) return fail(400, { error: 'Could not generate a valid slug from the name.' });
		if (!isValidSlug(slug)) return fail(400, { error: 'Invalid slug. Use lowercase letters, numbers, and hyphens.' });
		if (RESERVED_SLUGS.includes(slug)) return fail(400, { error: 'That slug is reserved.' });
		if (await checkSlugExists(slug)) return fail(400, { error: 'A website with that slug already exists.' });

		const access = await readVisibility(formData);
		if (!access.ok) return fail(400, { error: access.error });

		try {
			const result = await provisionWebsite({
				name,
				slug,
				gitUrl: parsedGitUrl,
				userId: locals.user.id,
				visibility: access.visibility,
				accessPasswordHash: access.passwordHash,
				showInPublicStats: access.showInPublicStats
			});

			return { success: true, websiteId: result.websiteId, deployed: result.deployed };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unexpected error occurred';
			return fail(500, { error: message });
		}
	},

	/**
	 * Bulk deploy: paste one repository per line, optionally drop them all into a
	 * section, and deploy them a few at a time. Every line gets its own result so
	 * one broken repo cannot take the batch down with it.
	 */
	bulk: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.CREATE_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const formData = await request.formData();
		const rawInput = String(formData.get('repos') ?? '');
		const groupName = String(formData.get('groupName') ?? '').trim();

		const repos = parseRepoLines(rawInput, MAX_BULK_REPOS + 1);
		if (repos.length === 0) {
			return fail(400, { error: 'Paste at least one repository URL, one per line.' });
		}
		if (repos.length > MAX_BULK_REPOS) {
			return fail(400, {
				error: `That is more than ${MAX_BULK_REPOS} repositories. Split it into a few batches.`
			});
		}

		const access = await readVisibility(formData);
		if (!access.ok) return fail(400, { error: access.error });

		const taken = await getTakenSlugs();

		interface BulkItem {
			input: string;
			slug: string | null;
			name: string | null;
			status: 'deployed' | 'created' | 'failed' | 'skipped';
			message: string;
			websiteId?: string;
		}

		const prepared = repos.map<BulkItem & { gitUrl?: string; base?: string }>((input) => {
			let gitUrl: string;
			try {
				gitUrl = normalizeGitUrl(input);
			} catch (err) {
				return {
					input,
					slug: null,
					name: null,
					status: 'failed',
					message: err instanceof Error ? err.message : 'Unsupported repository URL'
				};
			}

			const repoName =
				parseGitHubRepo(gitUrl)?.repo ?? gitUrl.replace(/\.git$/i, '').split('/').pop() ?? '';
			let base = slugFromRepo(repoName);
			if (!base) {
				return {
					input,
					slug: null,
					name: null,
					status: 'failed',
					message: 'Could not work out a slug from that repository name'
				};
			}
			if (RESERVED_SLUGS.includes(base)) base = `${base}-site`;

			const slug = uniqueSlug(base, taken);
			taken.add(slug);

			return {
				input,
				slug,
				name: nameFromRepo(repoName),
				status: 'skipped',
				message: '',
				gitUrl,
				base
			};
		});

		const deployable = prepared.filter((item) => item.gitUrl && item.slug && item.name);
		if (deployable.length === 0) {
			return fail(400, {
				error: 'None of those repository URLs could be used. Nothing was created and no section was made.',
				bulk: {
					group: null,
					deployed: 0,
					failed: prepared.length,
					items: prepared.map((item) => ({
						input: item.input,
						slug: item.slug,
						name: item.name,
						status: item.status,
						message: item.message
					}))
				}
			});
		}

		// One section for the whole batch, reused if it already exists so a
		// workshop can add more sites later. Only created once we know at least
		// one repository is deployable, so a typo cannot leave an empty section.
		let group: { id: string; name: string; slug: string } | null = null;
		if (groupName) {
			const groupSlug = normalizeSlug(groupName);
			if (!groupSlug || !isValidSlug(groupSlug)) {
				return fail(400, { error: 'Use lowercase letters, numbers and hyphens for the section name.' });
			}
			const existing = await getGroupBySlug(groupSlug);
			group = existing
				? { id: existing.id, name: existing.name, slug: existing.slug }
				: await createGroup(groupName, groupSlug, locals.user.id).then((created) => ({
						id: created.id,
						name: created.name,
						slug: created.slug
					}));
		}

		const results = await mapWithConcurrency(prepared, BULK_CONCURRENCY, async (item) => {
			if (!item.gitUrl || !item.slug || !item.name) return item;

			try {
				const result = await provisionWebsite({
					name: item.name,
					slug: item.slug,
					gitUrl: item.gitUrl,
					userId: locals.user!.id,
					groupId: group?.id ?? null,
					visibility: access.visibility,
					accessPasswordHash: access.passwordHash,
					showInPublicStats: access.showInPublicStats
				});

				return {
					...item,
					websiteId: result.websiteId,
					status: result.deployed ? ('deployed' as const) : ('failed' as const),
					message: result.deployed ? 'Live' : result.error ?? 'Deploy failed'
				};
			} catch (err) {
				return {
					...item,
					status: 'failed' as const,
					message: err instanceof Error ? err.message : 'Unexpected error'
				};
			}
		});

		const deployed = results.filter((item) => item.status === 'deployed').length;
		const failed = results.filter((item) => item.status === 'failed').length;

		await logAudit(
			locals.user.id,
			AuditAction.WEBSITE_CREATED,
			`Bulk deploy: ${deployed}/${results.length} live${group ? ` in "${group.name}"` : ''}` +
				(failed ? `, ${failed} failed` : '')
		);

		return {
			bulk: {
				group,
				deployed,
				failed,
				items: results.map((item) => ({
					input: item.input,
					slug: item.slug,
					name: item.name,
					status: item.status,
					message: item.message,
					websiteId: item.websiteId
				}))
			}
		};
	}
};

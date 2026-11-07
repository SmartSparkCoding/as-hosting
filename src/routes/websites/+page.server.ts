import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	getAllWebsites,
	getStorageStats,
	archiveWebsite,
	relaunchWebsite,
	setWebsiteVisibility,
	setShowInPublicStats,
	updateWebsiteStatus
} from '$lib/server/services/website.service';
import { getAnalyticsSummaries } from '$lib/server/services/analytics.service';
import {
	createGroup,
	getGroupBySlug,
	getGroupSummaries,
	getTakenSlugs,
	setWebsiteGroup
} from '$lib/server/services/group.service';
import { HostingStorage } from '$lib/server/hosting/storage';
import { hashPassword } from '$lib/server/auth/password';
import { AuditAction, logAudit } from '$lib/server/services/audit.service';
import { reindexWebsite, removeFromIndex } from '$lib/server/services/search.service';
import { hasPermission, Permission } from '$lib/permissions';
import { RESERVED_SLUGS } from '$lib/constants';
import { isValidSlug, normalizeSlug } from '$lib/utils';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const [websites, storageStats, groups] = await Promise.all([
		getAllWebsites(),
		getStorageStats(),
		getGroupSummaries().catch((err) => {
			console.error('[groups] Could not load sections:', err);
			return [];
		})
	]);

	const analytics = await getAnalyticsSummaries(
		websites.map((website) => website.id),
		7
	).catch((err) => {
		console.error('[analytics] Could not load website summaries:', err);
		return {} as Record<string, { pageviews: number; visitors: number }>;
	});

	return { websites, storage: storageStats, analytics, groups };
};

type BulkOp = 'public' | 'unlisted' | 'password' | 'archive' | 'relaunch' | 'group' | 'ungroup';

const OPS: BulkOp[] = ['public', 'unlisted', 'password', 'archive', 'relaunch', 'group', 'ungroup'];

interface BulkOutcome {
	op: BulkOp;
	done: string[];
	skipped: { name: string; reason: string }[];
	section?: string;
}

/**
 * Runs one bulk action over a set of sites. Every site is handled on its own so
 * a single failure (a missing archive, a reserved slug) never stops the batch.
 */
async function runBulk(
	op: BulkOp,
	websiteIds: string[],
	userId: string,
	formData: FormData
): Promise<{ error: string } | { outcome: BulkOutcome }> {
	const websites = await getAllWebsites();
	const targets = websites.filter((website) => websiteIds.includes(website.id));
	if (targets.length === 0) return { error: 'Pick at least one website.' };

	const done: string[] = [];
	const skipped: { name: string; reason: string }[] = [];
	const storage = new HostingStorage();

	let accessPasswordHash: string | null = null;
	if (op === 'password') {
		const password = ((formData.get('accessPassword') as string) ?? '').trim();
		if (password.length < 6) return { error: 'Set a password of at least 6 characters.' };
		accessPasswordHash = await hashPassword(password);
	}

	let group: { id: string; name: string } | null = null;
	if (op === 'group') {
		const rawName = ((formData.get('groupName') as string) ?? '').trim();
		if (!rawName) return { error: 'Give the section a name.' };

		const slug = normalizeSlug(rawName);
		if (!isValidSlug(slug)) return { error: 'That section name cannot be used as a URL.' };
		if (RESERVED_SLUGS.includes(slug)) return { error: `"${slug}" is reserved, pick another section name.` };

		const existing = await getGroupBySlug(slug);
		if (existing) {
			group = { id: existing.id, name: existing.name };
		} else {
			const taken = await getTakenSlugs();
			if (taken.has(slug)) return { error: `"${slug}" is already taken by a website.` };
			const created = await createGroup(rawName, slug, userId);
			group = { id: created.id, name: created.name };
		}
	}

	for (const website of targets) {
		try {
			if (op === 'archive') {
				if (website.status === 'ARCHIVED') {
					skipped.push({ name: website.name, reason: 'already archived' });
					continue;
				}
				try {
					await storage.archive(website.id);
				} catch {
					// Nothing published yet, nothing to move aside.
				}
				await archiveWebsite(website.id);
				await removeFromIndex(website.id).catch(() => undefined);
				done.push(website.name);
				continue;
			}

			if (op === 'relaunch') {
				if (website.status !== 'ARCHIVED') {
					skipped.push({ name: website.name, reason: 'not archived' });
					continue;
				}
				try {
					await storage.restore(website.id);
				} catch {
					skipped.push({ name: website.name, reason: 'no archived copy' });
					continue;
				}
				await relaunchWebsite(website.id);
				await updateWebsiteStatus(website.id, 'ACTIVE');
				await reindexWebsite(website.id).catch(() => undefined);
				done.push(website.name);
				continue;
			}

			if (op === 'group' || op === 'ungroup') {
				await setWebsiteGroup(website.id, group ? group.id : null);
				done.push(website.name);
				continue;
			}

			// public / unlisted / password
			const visibility = op === 'public' ? 'PUBLIC' : op === 'unlisted' ? 'UNLISTED' : 'PASSWORD';
			await setWebsiteVisibility(website.id, visibility, op === 'password' ? accessPasswordHash : null);
			if (op !== 'public') await setShowInPublicStats(website.id, false);
			if (op === 'public') {
				await reindexWebsite(website.id).catch(() => undefined);
			} else {
				await removeFromIndex(website.id).catch(() => undefined);
			}
			done.push(website.name);
		} catch (err) {
			skipped.push({
				name: website.name,
				reason: err instanceof Error ? err.message : 'failed'
			});
		}
	}

	const labels: Record<BulkOp, string> = {
		public: 'set to Public',
		unlisted: 'set to Unlisted',
		password: 'password protected',
		archive: 'archived',
		relaunch: 'relaunched',
		group: `moved into "${group?.name ?? ''}"`,
		ungroup: 'removed from their section'
	};

	if (done.length > 0) {
		if (op === 'archive' || op === 'relaunch') {
			await logAudit(
				userId,
				op === 'archive' ? AuditAction.WEBSITE_ARCHIVED : AuditAction.WEBSITE_RELAUNCHED,
				`Bulk ${labels[op]}: ${done.length} site(s) — ${done.join(', ')}`
			);
		} else if (op === 'public' || op === 'unlisted' || op === 'password') {
			await logAudit(
				userId,
				op === 'password'
					? AuditAction.WEBSITE_ACCESS_PASSWORD_CHANGED
					: AuditAction.WEBSITE_VISIBILITY_CHANGED,
				`Bulk ${labels[op]}: ${done.length} site(s) — ${done.join(', ')}`
			);
		} else {
			await logAudit(
				userId,
				AuditAction.WEBSITE_UPDATED,
				`Bulk ${labels[op]}: ${done.length} site(s) — ${done.join(', ')}`
			);
		}
	}

	return { outcome: { op, done, skipped, section: group?.name } };
}

const OP_PERMISSION: Record<BulkOp, Permission> = {
	public: Permission.EDIT_WEBSITE,
	unlisted: Permission.EDIT_WEBSITE,
	password: Permission.EDIT_WEBSITE,
	archive: Permission.ARCHIVE_WEBSITE,
	relaunch: Permission.RELAUNCH_WEBSITE,
	group: Permission.EDIT_WEBSITE,
	ungroup: Permission.EDIT_WEBSITE
};

function canRunBulk(
	user: { role: Parameters<typeof hasPermission>[0]; ambassadorPermission?: Parameters<typeof hasPermission>[2] },
	op: BulkOp
): boolean {
	return hasPermission(user.role, OP_PERMISSION[op], user.ambassadorPermission);
}

export const actions: Actions = {
	/** Applies one action to the ticked sites. */
	bulk: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });

		const formData = await request.formData();
		const op = formData.get('op') as BulkOp;
		if (!OPS.includes(op)) return fail(400, { error: 'Pick an action.' });
		if (!canRunBulk(locals.user, op)) return fail(403, { error: 'Permission denied' });

		const websiteIds = formData.getAll('ids').map(String).filter(Boolean);
		if (websiteIds.length === 0) return fail(400, { error: 'Pick at least one website.' });

		const result = await runBulk(op, websiteIds, locals.user.id, formData);
		if ('error' in result) return fail(400, { error: result.error });
		return { bulk: result.outcome };
	},

	/** Applies one action to every site in a section, no ticking required. */
	groupBulk: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });

		const formData = await request.formData();
		const op = formData.get('op') as BulkOp;
		if (!OPS.includes(op)) return fail(400, { error: 'Pick an action.' });
		if (!canRunBulk(locals.user, op)) return fail(403, { error: 'Permission denied' });

		const groupId = formData.get('groupId') as string;
		if (!groupId) return fail(400, { error: 'Missing section.' });

		const websites = await getAllWebsites();
		const websiteIds = websites.filter((website) => website.groupId === groupId).map((w) => w.id);
		if (websiteIds.length === 0) return fail(400, { error: 'That section is empty.' });

		const result = await runBulk(op, websiteIds, locals.user.id, formData);
		if ('error' in result) return fail(400, { error: result.error });
		return { bulk: result.outcome };
	}
};

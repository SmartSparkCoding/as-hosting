import { redirect, fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	getWebsiteById,
	archiveWebsite,
	relaunchWebsite,
	updateWebsiteStatus,
	updateWebsiteStorage,
	deleteWebsite,
	setWebsiteVisibility,
	setShowInPublicStats,
	type SiteVisibility
} from '$lib/server/services/website.service';
import { getDeploymentsByWebsite, createDeployment } from '$lib/server/services/deployment.service';
import { getWebsiteAnalyticsHighlights, emptyAnalyticsHighlight } from '$lib/server/services/analytics.service';
import { Deployer } from '$lib/server/hosting/deployer';
import { HostingStorage } from '$lib/server/hosting/storage';
import { hasPermission, Permission } from '$lib/permissions';
import { logAudit, AuditAction } from '$lib/server/services/audit.service';
import { getUserById } from '$lib/server/services/user.service';
import { hashPassword } from '$lib/server/auth/password';
import { postDeployStatus } from '$lib/server/github/deploy-status';
import { createSlackNotifier, notifyDeploymentFailure } from '$lib/server/slack/notifier';
import { formatBytes } from '$lib/utils';

export const load: PageServerLoad = async ({ locals, params }) => {
	if (!locals.user) throw redirect(302, '/login');

	const website = await getWebsiteById(params.id);
	if (!website) throw error(404, 'Website not found');

	const deployments = await getDeploymentsByWebsite(website.id);
	const analytics = await getWebsiteAnalyticsHighlights(website.id, 7).catch((err) => {
		console.error('[analytics] Could not load website highlights:', err);
		return emptyAnalyticsHighlight(7);
	});
	const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';

	const storage = new HostingStorage();
	const releases = await storage.listReleases(website.id).catch(() => []);
	const activeRelease = await storage.getActiveRelease(website.id).catch(() => null);

	return {
		website,
		deployments,
		analytics,
		releases,
		activeRelease,
		publicUrl: `${baseUrl}/${website.slug}/`
	};
};

function parseIssues(raw: string | null): string {
	return raw ?? '[]';
}

export const actions: Actions = {
	deploy: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.EDIT_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const website = await getWebsiteById(params.id);
		if (!website) return fail(404, { error: 'Website not found' });

		await updateWebsiteStatus(website.id, 'BUILDING');
		await logAudit(locals.user.id, AuditAction.WEBSITE_DEPLOYED, `Redeploying "${website.name}"`);

		const deployer = new Deployer();
		const result = await deployer.deploy(website.id, website.gitUrl);
		const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5173'}/${website.slug}/`;

		if (result.success) {
			const storage = new HostingStorage();
			const bytes = await storage.getDirectorySize(storage.getCurrentPath(website.id));
			await updateWebsiteStorage(website.id, bytes);
			await updateWebsiteStatus(website.id, 'ACTIVE');

			const statusLine = await postDeployStatus({
				gitUrl: website.gitUrl,
				commitSha: result.commitSha,
				state: 'success',
				description: `Deployed ${website.name}`,
				targetUrl: publicUrl
			}).catch(() => null);

			await createDeployment(
				website.id,
				locals.user.id,
				true,
				statusLine ? `${result.log}\n${statusLine}` : result.log,
				undefined,
				{
					kind: 'deploy',
					release: result.release ?? null,
					commitSha: result.commitSha ?? null,
					commitMessage: result.commitMessage ?? null,
					auditScore: result.audit?.score ?? null,
					auditIssues: result.audit ? parseIssues(JSON.stringify(result.audit.issues)) : null
				}
			);
		} else {
			const existingSite = await getWebsiteById(website.id);
			if (existingSite && existingSite.status !== 'BUILDING') {
				// Had a live version, keep it active
				await updateWebsiteStatus(website.id, existingSite.status as 'ACTIVE');
			} else {
				await updateWebsiteStatus(website.id, 'FAILED');
			}

			const statusLine = await postDeployStatus({
				gitUrl: website.gitUrl,
				commitSha: result.commitSha,
				state: 'failure',
				description: (result.error ?? 'Deploy failed').slice(0, 140),
				targetUrl: publicUrl
			}).catch(() => null);

			await createDeployment(
				website.id,
				locals.user.id,
				false,
				statusLine ? `${result.log}\n${statusLine}` : result.log,
				result.error,
				{
					kind: 'deploy',
					release: null,
					commitSha: result.commitSha ?? null,
					commitMessage: result.commitMessage ?? null
				}
			);

			try {
				const fullUser = await getUserById(locals.user.id);
				if (fullUser) {
					const notifier = createSlackNotifier();
					await notifyDeploymentFailure(
						notifier,
						fullUser.slackId,
						website.name,
						result.error || 'Unknown error'
					);
				}
			} catch {
				// Slack notification failure is non-critical
			}
		}

		return { success: result.success, deployed: result.success };
	},

	rollback: async ({ locals, params, request }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.EDIT_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const website = await getWebsiteById(params.id);
		if (!website) return fail(404, { error: 'Website not found' });
		if (website.status === 'ARCHIVED') {
			return fail(400, { error: 'Relaunch the website before rolling back' });
		}

		const formData = await request.formData();
		const release = String(formData.get('release') ?? '');
		if (!release) return fail(400, { error: 'Pick a release to roll back to' });

		const storage = new HostingStorage();
		try {
			await storage.activateRelease(website.id, release);
		} catch (err) {
			return fail(400, {
				error: err instanceof Error ? err.message : 'Could not activate that release'
			});
		}

		const bytes = await storage.getDirectorySize(storage.getCurrentPath(website.id));
		await updateWebsiteStorage(website.id, bytes);
		await updateWebsiteStatus(website.id, 'ACTIVE');

		const log = `Rolled back to release ${release} (${formatBytes(bytes)}).`;
		await createDeployment(website.id, locals.user.id, true, log, undefined, {
			kind: 'rollback',
			release
		});
		await logAudit(locals.user.id, AuditAction.WEBSITE_ROLLED_BACK, `Rolled back "${website.name}" to ${release}`);

		return { success: true, rolledBack: release };
	},

	setVisibility: async ({ locals, params, request }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.EDIT_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const website = await getWebsiteById(params.id);
		if (!website) return fail(404, { error: 'Website not found' });

		const formData = await request.formData();
		const visibility = String(formData.get('visibility') ?? '') as SiteVisibility;
		// The form field is `accessPassword`; keep them in step or the password
		// silently arrives empty and PASSWORD mode looks broken.
		const password = String(formData.get('accessPassword') ?? '');
		const showInPublicStats = formData.get('showInPublicStats') === 'on';

		if (!['PUBLIC', 'UNLISTED', 'PASSWORD'].includes(visibility)) {
			return fail(400, { error: 'Unknown visibility option' });
		}

		let passwordHash = website.accessPasswordHash ?? null;

		if (visibility === 'PASSWORD') {
			if (password && password.length < 6) {
				return fail(400, { error: 'Use at least 6 characters for the site password' });
			}
			if (password) {
				passwordHash = await hashPassword(password);
				await logAudit(
					locals.user.id,
					AuditAction.WEBSITE_ACCESS_PASSWORD_CHANGED,
					`Changed access password for "${website.name}"`
				);
			} else if (!passwordHash) {
				return fail(400, { error: 'Set a password to make the site password protected' });
			}
		}

		await setWebsiteVisibility(website.id, visibility, visibility === 'PASSWORD' ? passwordHash : null);
		if (visibility === 'PUBLIC') {
			await setShowInPublicStats(website.id, showInPublicStats);
		} else {
			await setShowInPublicStats(website.id, false);
		}
		await logAudit(
			locals.user.id,
			AuditAction.WEBSITE_VISIBILITY_CHANGED,
			`Set "${website.name}" visibility to ${visibility}`
		);

		return { success: true, visibility };
	},

	archive: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.ARCHIVE_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const website = await getWebsiteById(params.id);
		if (!website) return fail(404, { error: 'Website not found' });
		if (website.status === 'ARCHIVED') return fail(400, { error: 'Website is already archived' });

		const storage = new HostingStorage();
		try {
			await storage.archive(website.id);
		} catch {
			// Archive might fail if no current directory exists
		}
		await archiveWebsite(website.id);
		await logAudit(locals.user.id, AuditAction.WEBSITE_ARCHIVED, `Archived "${website.name}"`);

		return { success: true };
	},

	relaunch: async ({ locals, request, params }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.RELAUNCH_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const website = await getWebsiteById(params.id);
		if (!website) return fail(404, { error: 'Website not found' });
		if (website.status !== 'ARCHIVED') return fail(400, { error: 'Only archived websites can be relaunched' });

		const formData = await request.formData();
		const expiresAtStr = formData.get('expiresAt') as string;
		const expiresAt = expiresAtStr ? new Date(expiresAtStr) : undefined;

		const storage = new HostingStorage();
		try {
			await storage.restore(website.id);
		} catch {
			return fail(400, { error: 'No archived version found to restore.' });
		}

		await relaunchWebsite(website.id, expiresAt);
		await updateWebsiteStatus(website.id, 'ACTIVE');
		await logAudit(locals.user.id, AuditAction.WEBSITE_RELAUNCHED, `Relaunched "${website.name}"`);

		return { success: true };
	},

	delete: async ({ locals, params }) => {
		if (!locals.user) return fail(401, { error: 'Not authenticated' });
		if (!hasPermission(locals.user.role, Permission.DELETE_WEBSITE, locals.user.ambassadorPermission)) {
			return fail(403, { error: 'Permission denied' });
		}

		const website = await getWebsiteById(params.id);
		if (!website) return fail(404, { error: 'Website not found' });
		if (website.status !== 'ARCHIVED') return fail(400, { error: 'Only archived websites can be deleted' });

		const storage = new HostingStorage();
		try {
			await storage.remove(website.id);
		} catch {
			// File removal failure is non-critical
		}
		await deleteWebsite(website.id);
		await logAudit(locals.user.id, AuditAction.WEBSITE_DELETED, `Deleted "${website.name}"`);

		throw redirect(302, '/websites');
	}
};

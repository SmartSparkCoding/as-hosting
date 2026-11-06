import { redirect, fail, error } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	getWebsiteById,
	archiveWebsite,
	relaunchWebsite,
	updateWebsiteStatus,
	updateWebsiteStorage,
	deleteWebsite
} from '$lib/server/services/website.service';
import { getDeploymentsByWebsite, createDeployment } from '$lib/server/services/deployment.service';
import { getWebsiteAnalyticsHighlights, emptyAnalyticsHighlight } from '$lib/server/services/analytics.service';
import { Deployer } from '$lib/server/hosting/deployer';
import { HostingStorage } from '$lib/server/hosting/storage';
import { hasPermission, Permission } from '$lib/permissions';
import { logAudit, AuditAction } from '$lib/server/services/audit.service';
import { getUserById } from '$lib/server/services/user.service';
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

	return {
		website,
		deployments,
		analytics,
		publicUrl: `${baseUrl}/${website.slug}/`
	};
};

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

		if (result.success) {
			const storage = new HostingStorage();
			const bytes = await storage.getDirectorySize(storage.getCurrentPath(website.id));
			await updateWebsiteStorage(website.id, bytes);
			await updateWebsiteStatus(website.id, 'ACTIVE');
			await createDeployment(website.id, locals.user.id, true, result.log);
		} else {
			const existingSite = await getWebsiteById(website.id);
			if (existingSite && existingSite.status !== 'BUILDING') {
				// Had a live version, keep it active
				await updateWebsiteStatus(website.id, existingSite.status as 'ACTIVE');
			} else {
				await updateWebsiteStatus(website.id, 'FAILED');
			}
			await createDeployment(website.id, locals.user.id, false, result.log, result.error);

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

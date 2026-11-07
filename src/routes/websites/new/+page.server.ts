import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import {
	createWebsite,
	checkSlugExists,
	updateWebsiteStatus,
	updateWebsiteStorage
} from '$lib/server/services/website.service';
import { createDeployment } from '$lib/server/services/deployment.service';
import { normalizeSlug, isValidSlug } from '$lib/utils';
import { hasPermission, Permission } from '$lib/permissions';
import { Deployer } from '$lib/server/hosting/deployer';
import { HostingStorage } from '$lib/server/hosting/storage';
import { logAudit, AuditAction } from '$lib/server/services/audit.service';
import { getUserById } from '$lib/server/services/user.service';
import { createSlackNotifier, notifyDeploymentFailure } from '$lib/server/slack/notifier';
import { RESERVED_SLUGS } from '$lib/constants';
import { postDeployStatus } from '$lib/server/github/deploy-status';
import { normalizeGitUrl } from '$lib/server/hosting/git-url';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	if (!hasPermission(locals.user.role, Permission.CREATE_WEBSITE, locals.user.ambassadorPermission)) {
		throw redirect(302, '/dashboard');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
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

		try {
			const website = await createWebsite(name, slug, parsedGitUrl, locals.user.id);
			await logAudit(locals.user.id, AuditAction.WEBSITE_CREATED, `Created "${name}" (${slug})`);

			const deployer = new Deployer();
			await updateWebsiteStatus(website.id, 'BUILDING');
			const result = await deployer.deploy(website.id, parsedGitUrl);
			const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5173'}/${slug}/`;

			if (result.success) {
				const storage = new HostingStorage();
				const bytes = await storage.getDirectorySize(storage.getCurrentPath(website.id));
				await updateWebsiteStorage(website.id, bytes);
				await updateWebsiteStatus(website.id, 'ACTIVE');
				const statusLine = await postDeployStatus({
					gitUrl: parsedGitUrl,
					commitSha: result.commitSha,
					state: 'success',
					description: `Deployed ${name}`,
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
						auditIssues: result.audit ? JSON.stringify(result.audit.issues) : null
					}
				);
				await logAudit(locals.user.id, AuditAction.WEBSITE_DEPLOYED, `Deployed "${name}"`);
			} else {
				await updateWebsiteStatus(website.id, 'FAILED');
				const statusLine = await postDeployStatus({
					gitUrl: parsedGitUrl,
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
						commitSha: result.commitSha ?? null,
						commitMessage: result.commitMessage ?? null
					}
				);
				await logAudit(locals.user.id, AuditAction.WEBSITE_DEPLOYED, `Deployment failed for "${name}"`);

				try {
					const fullUser = await getUserById(locals.user.id);
					if (fullUser) {
						const notifier = createSlackNotifier();
						await notifyDeploymentFailure(notifier, fullUser.slackId, name, result.error || 'Unknown error');
					}
				} catch {
					// Slack notification failure is non-critical
				}
			}

			return { success: true, websiteId: website.id, deployed: result.success };
		} catch (err) {
			const message = err instanceof Error ? err.message : 'An unexpected error occurred';
			return fail(500, { error: message });
		}
	}
};

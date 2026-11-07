import {
	getWebsiteById,
	updateWebsiteStatus,
	updateWebsiteStorage,
} from '$lib/server/services/website.service';
import { reindexWebsite } from './search.service';
import { countDeployments, createDeployment } from '$lib/server/services/deployment.service';
import { Deployer } from '$lib/server/hosting/deployer';
import { HostingStorage } from '$lib/server/hosting/storage';
import { deployTargetUrl, postDeployStatus } from '$lib/server/github/deploy-status';
import { getUserById } from '$lib/server/services/user.service';
import { createSlackNotifier, notifyDeploymentFailure } from '$lib/server/slack/notifier';
import { logAudit, AuditAction } from '$lib/server/services/audit.service';

/**
 * One deploy path shared by the dashboard buttons and the GitHub webhook, so an
 * automatic deploy records exactly the same thing as a manual one: a release,
 * the site checks, a screenshot, a commit status and an audit entry.
 */

export interface RedeployResult {
	success: boolean;
	error?: string;
	commitSha?: string | null;
	release?: string | null;
}

export interface RedeployOptions {
	websiteId: string;
	/** User the deploy is attributed to. Falls back to the site creator. */
	triggeredBy?: string | null;
	/** Deployment kind: 'deploy', 'push' (webhook), 'preview', 'recovery'. */
	kind?: string;
	/** Audit text. Defaults to `Redeploying "<name>"`. */
	auditDetails?: string;
	/** Skip the Slack DM on failure (used by previews). */
	silentOnFailure?: boolean;
}

export async function redeployWebsite(options: RedeployOptions): Promise<RedeployResult> {
	const website = await getWebsiteById(options.websiteId);
	if (!website) return { success: false, error: 'Website not found' };

	const userId = options.triggeredBy ?? website.createdBy;
	const kind = options.kind ?? 'deploy';

	await updateWebsiteStatus(website.id, 'BUILDING');
	await logAudit(
		userId,
		AuditAction.WEBSITE_DEPLOYED,
		options.auditDetails ?? `Redeploying "${website.name}"`,
	);

	const deployer = new Deployer();
	const result = await deployer.deploy(website.id, website.gitUrl);
	const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5173'}/${website.slug}/`;
	const deployNumber = (await countDeployments(website.id)) + 1;

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
			targetUrl: deployTargetUrl(publicUrl, deployNumber),
		}).catch(() => null);

		await createDeployment(
			website.id,
			userId,
			true,
			statusLine ? `${result.log}\n${statusLine}` : result.log,
			undefined,
			{
				kind,
				release: result.release ?? null,
				commitSha: result.commitSha ?? null,
				commitMessage: result.commitMessage ?? null,
				auditScore: result.audit?.score ?? null,
				auditIssues: result.audit ? JSON.stringify(result.audit.issues) : null,
			},
		);

		try {
			await reindexWebsite(website.id);
		} catch {
			// Search indexing is best effort: a deploy that worked stays live.
		}

		return {
			success: true,
			commitSha: result.commitSha ?? null,
			release: result.release ?? null,
		};
	}

	// A failed redeploy should not take a live site down.
	const existing = await getWebsiteById(website.id);
	if (existing && existing.status !== 'BUILDING') {
		await updateWebsiteStatus(website.id, existing.status as 'ACTIVE');
	} else {
		await updateWebsiteStatus(website.id, 'FAILED');
	}

	const statusLine = await postDeployStatus({
		gitUrl: website.gitUrl,
		commitSha: result.commitSha,
		state: 'failure',
		description: (result.error ?? 'Deploy failed').slice(0, 140),
		targetUrl: publicUrl,
	}).catch(() => null);

	await createDeployment(
		website.id,
		userId,
		false,
		statusLine ? `${result.log}\n${statusLine}` : result.log,
		result.error,
		{
			kind,
			release: null,
			commitSha: result.commitSha ?? null,
			commitMessage: result.commitMessage ?? null,
		},
	);

	if (!options.silentOnFailure) {
		try {
			const owner = await getUserById(userId);
			if (owner) {
				const notifier = createSlackNotifier();
				await notifyDeploymentFailure(
					notifier,
					owner.slackId,
					website.name,
					result.error || 'Unknown error',
				);
			}
		} catch {
			// Slack notification failure is non-critical
		}
	}

	return {
		success: false,
		error: result.error,
		commitSha: result.commitSha ?? null,
	};
}

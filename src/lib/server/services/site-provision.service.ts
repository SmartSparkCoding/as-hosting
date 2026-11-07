import {
	createWebsite,
	updateWebsiteStatus,
	updateWebsiteStorage,
	type SiteVisibility
} from './website.service';
import { setWebsiteVisibility, setShowInPublicStats } from './website.service';
import { setWebsiteGroup } from './group.service';
import { createDeployment, countDeployments } from './deployment.service';
import { Deployer } from '../hosting/deployer';
import { HostingStorage } from '../hosting/storage';
import { logAudit, AuditAction } from './audit.service';
import { getUserById } from './user.service';
import { createSlackNotifier, notifyDeploymentFailure } from '../slack/notifier';
import { postDeployStatus, deployTargetUrl } from '../github/deploy-status';
import { reindexWebsite } from './search.service';

/**
 * Creating and deploying a website, in one place.
 *
 * Both the single "new website" form and the bulk deploy form go through here
 * so they cannot drift apart: same audit entries, same GitHub commit status,
 * same Slack failure DM, same deployment row.
 */
export interface ProvisionOptions {
	name: string;
	slug: string;
	gitUrl: string;
	userId: string;
	groupId?: string | null;
	visibility?: SiteVisibility;
	accessPasswordHash?: string | null;
	showInPublicStats?: boolean;
}

export interface ProvisionResult {
	name: string;
	slug: string;
	websiteId: string;
	deployed: boolean;
	error?: string;
	log: string;
}

export async function provisionWebsite(options: ProvisionOptions): Promise<ProvisionResult> {
	const {
		name,
		slug,
		gitUrl,
		userId,
		groupId = null,
		visibility = 'PUBLIC',
		accessPasswordHash = null,
		showInPublicStats = true
	} = options;

	const website = await createWebsite(name, slug, gitUrl, userId);
	await logAudit(userId, AuditAction.WEBSITE_CREATED, `Created "${name}" (${slug})`);

	if (groupId) {
		await setWebsiteGroup(website.id, groupId);
	}
	if (visibility !== 'PUBLIC' || accessPasswordHash) {
		await setWebsiteVisibility(website.id, visibility, accessPasswordHash);
	}
	if (!showInPublicStats) {
		await setShowInPublicStats(website.id, false);
	}

	const publicUrl = `${process.env.PUBLIC_BASE_URL || 'http://localhost:5173'}/${slug}/`;
	const deployNumber = (await countDeployments(website.id)) + 1;

	const deployer = new Deployer();
	await updateWebsiteStatus(website.id, 'BUILDING');
	const result = await deployer.deploy(website.id, gitUrl);

	if (result.success) {
		const storage = new HostingStorage();
		const bytes = await storage.getDirectorySize(storage.getCurrentPath(website.id));
		await updateWebsiteStorage(website.id, bytes);
		await updateWebsiteStatus(website.id, 'ACTIVE');

		const statusLine = await postDeployStatus({
			gitUrl,
			commitSha: result.commitSha,
			state: 'success',
			description: `Deployed ${name}`,
			targetUrl: deployTargetUrl(publicUrl, deployNumber)
		}).catch(() => null);

		await createDeployment(
			website.id,
			userId,
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
		await logAudit(userId, AuditAction.WEBSITE_DEPLOYED, `Deployed "${name}"`);

		try {
			await reindexWebsite(website.id);
		} catch {
			// Search indexing is best effort: a deploy that worked stays live.
		}

		return { name, slug, websiteId: website.id, deployed: true, log: result.log };
	}

	await updateWebsiteStatus(website.id, 'FAILED');
	const statusLine = await postDeployStatus({
		gitUrl,
		commitSha: result.commitSha,
		state: 'failure',
		description: (result.error ?? 'Deploy failed').slice(0, 140),
		targetUrl: publicUrl
	}).catch(() => null);

	await createDeployment(
		website.id,
		userId,
		false,
		statusLine ? `${result.log}\n${statusLine}` : result.log,
		result.error,
		{
			kind: 'deploy',
			commitSha: result.commitSha ?? null,
			commitMessage: result.commitMessage ?? null
		}
	);
	await logAudit(userId, AuditAction.WEBSITE_DEPLOYED, `Deployment failed for "${name}"`);

	try {
		const fullUser = await getUserById(userId);
		if (fullUser) {
			const notifier = createSlackNotifier();
			await notifyDeploymentFailure(
				notifier,
				fullUser.slackId,
				name,
				result.error || 'Unknown error'
			);
		}
	} catch {
		// Slack notification failure is non-critical
	}

	return {
		name,
		slug,
		websiteId: website.id,
		deployed: false,
		error: result.error ?? 'Deploy failed',
		log: result.log
	};
}

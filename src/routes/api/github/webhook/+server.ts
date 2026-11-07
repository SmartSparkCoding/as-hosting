import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	defaultBranchOf,
	repoFullName,
	verifyWebhookSignature,
	webhookSecret,
} from '$lib/server/github/webhook';
import { getAllWebsites } from '$lib/server/services/website.service';
import { closePreviews, deployPreview } from '$lib/server/services/preview.service';
import { redeployWebsite } from '$lib/server/services/redeploy.service';

/**
 * GitHub webhook receiver. Configured per repository:
 *   Payload URL: https://<host>/api/github/webhook
 *   Content type: application/json
 *   Secret: GITHUB_WEBHOOK_SECRET
 *   Events: pushes, pull requests
 *
 * A push to the repository's default branch redeploys every site that points at
 * that repository. Pull request events create a preview site when the site has
 * previews switched on. Everything else is acknowledged and ignored.
 */

const MAX_SITES_PER_EVENT = 10;

interface PushPayload {
	ref?: string;
	repository?: { full_name?: string; default_branch?: string };
}

interface PullRequestPayload {
	action?: string;
	number?: number;
	repository?: { full_name?: string };
	pull_request?: { number?: number; title?: string };
}

export const POST: RequestHandler = async ({ request }) => {
	const secret = webhookSecret();
	if (!secret) {
		return json({ error: 'Webhook is not configured' }, { status: 503 });
	}

	const raw = await request.text();
	const signature = request.headers.get('x-hub-signature-256');
	if (!verifyWebhookSignature(raw, signature, secret)) {
		return json({ error: 'Invalid signature' }, { status: 401 });
	}

	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const event = request.headers.get('x-github-event') ?? 'unknown';

	if (event === 'ping') {
		return json({ ok: true, event: 'ping' });
	}

	if (event === 'push') {
		const push = payload as PushPayload;
		const repo = repoFullName(push.repository?.full_name);
		if (!repo) return json({ ok: true, ignored: 'no repository' });

		const defaultBranch = push.repository?.default_branch ?? 'main';
		if (push.ref && push.ref !== `refs/heads/${defaultBranch}`) {
			return json({
				ok: true,
				ignored: 'not the default branch',
				ref: push.ref,
			});
		}

		const sites = (await getAllWebsites())
			.filter((site) => !site.previewOfId && site.status !== 'ARCHIVED')
			.filter((site) => repoFullName(site.gitUrl) === repo)
			.slice(0, MAX_SITES_PER_EVENT);

		const results = [];
		for (const site of sites) {
			const result = await redeployWebsite({
				websiteId: site.id,
				triggeredBy: site.createdBy,
				kind: 'push',
				auditDetails: `Auto-deploy: push to ${repo}`,
			});
			results.push({
				slug: site.slug,
				success: result.success,
				error: result.error,
			});
		}

		return json({ ok: true, event, repo, deployed: results });
	}

	if (event === 'pull_request') {
		const pr = payload as PullRequestPayload;
		const repo = repoFullName(pr.repository?.full_name);
		const number = pr.number ?? pr.pull_request?.number;
		const action = pr.action ?? '';
		if (!repo || !number) return json({ ok: true, ignored: 'no pull request' });

		const parents = (await getAllWebsites())
			.filter((site) => !site.previewOfId && site.previewsEnabled && site.status === 'ACTIVE')
			.filter((site) => repoFullName(site.gitUrl) === repo)
			.slice(0, MAX_SITES_PER_EVENT);

		if (parents.length === 0) {
			return json({
				ok: true,
				event,
				repo,
				ignored: 'no sites with previews enabled',
			});
		}

		if (action === 'closed') {
			const closed: Record<string, string[]> = {};
			for (const parent of parents) {
				closed[parent.slug] = await closePreviews(parent.id, number);
			}
			return json({ ok: true, event, repo, pr: number, closed });
		}

		if (action === 'opened' || action === 'synchronize' || action === 'reopened') {
			const previews = [];
			for (const parent of parents) {
				const preview = await deployPreview(parent.id, number);
				previews.push({
					site: parent.slug,
					preview: preview?.slug ?? null,
					created: preview?.created ?? false,
					success: preview?.deploy?.success ?? false,
					error: preview?.deploy?.error,
				});
			}
			return json({ ok: true, event, repo, pr: number, previews });
		}

		return json({ ok: true, event, ignored: `pull_request.${action}` });
	}

	return json({ ok: true, event, ignored: 'event not handled' });
};

import { env } from '$env/dynamic/private';
import { parseGitHubRepo } from '../hosting/git-url';

/**
 * Report deploy results back to the commit on GitHub so the repo shows a green
 * or red check next to the SHA that was deployed.
 *
 * Best effort: without a token (or for non-GitHub remotes) every call is a no-op
 * and the deploy carries on. The token needs `repo:status` on the repository,
 * which a fine grained PAT scoped to the club org gives you.
 */

export type DeployStatusState = 'pending' | 'success' | 'failure' | 'error';

export interface DeployStatusInput {
	gitUrl: string;
	commitSha: string | null | undefined;
	state: DeployStatusState;
	description: string;
	targetUrl?: string | null;
}

function token(): string | undefined {
	return env.GITHUB_STATUS_TOKEN || env.GITHUB_TOKEN || undefined;
}

export function deployStatusEnabled(): boolean {
	return Boolean(token());
}

export async function postDeployStatus(input: DeployStatusInput): Promise<string | null> {
	const repoRef = parseGitHubRepo(input.gitUrl);
	if (!repoRef) return null;

	const sha = input.commitSha?.trim();
	if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return null;

	const apiToken = token();
	if (!apiToken) return null;

	try {
		const response = await fetch(
			`https://api.github.com/repos/${repoRef.owner}/${repoRef.repo}/statuses/${sha}`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiToken}`,
					Accept: 'application/vnd.github+json',
					'X-GitHub-Api-Version': '2022-11-28',
					'Content-Type': 'application/json',
					'User-Agent': 'as-hosting'
				},
				body: JSON.stringify({
					state: input.state,
					context: 'as-hosting/deploy',
					description: input.description.slice(0, 140),
					target_url: input.targetUrl ?? undefined
				}),
				signal: AbortSignal.timeout(8000)
			}
		);

		if (!response.ok) {
			return `GitHub status update failed (${response.status})`;
		}

		return `Reported "${input.state}" to ${repoRef.owner}/${repoRef.repo}@${sha.slice(0, 7)}.`;
	} catch (err) {
		return `GitHub status update failed: ${err instanceof Error ? err.message : String(err)}`;
	}
}

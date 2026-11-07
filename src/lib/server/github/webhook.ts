import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseGitHubRepo } from '$lib/server/hosting/git-url';

/**
 * GitHub webhook helpers. The signature check is the only thing standing
 * between a public POST endpoint and "anyone can redeploy your sites", so it
 * compares the full `sha256=...` string in constant time and refuses an empty
 * secret.
 */

export function verifyWebhookSignature(
	rawBody: string,
	signature: string | null,
	secret: string,
): boolean {
	if (!signature || !secret) return false;
	const expected = `sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`;
	const a = Buffer.from(expected, 'utf8');
	const b = Buffer.from(signature, 'utf8');
	if (a.length !== b.length) return false;
	return timingSafeEqual(a, b);
}

export function webhookSecret(): string | null {
	const secret = process.env.GITHUB_WEBHOOK_SECRET;
	return secret && secret.length > 0 ? secret : null;
}

/** `owner/repo` (lowercased) from a git URL or a bare full name, else null. */
export function repoFullName(value: string | null | undefined): string | null {
	if (!value) return null;
	const parsed = parseGitHubRepo(value);
	if (parsed) return `${parsed.owner}/${parsed.repo}`.toLowerCase();
	const bare = value
		.trim()
		.replace(/\.git$/, '')
		.replace(/\/+$/, '');
	if (/^[\w.-]+\/[\w.-]+$/.test(bare)) return bare.toLowerCase();
	return null;
}

export function defaultBranchOf(payload: unknown): string | null {
	const repository = (payload as { repository?: { default_branch?: unknown } } | null)?.repository;
	const branch = repository?.default_branch;
	return typeof branch === 'string' && branch.length > 0 ? branch : null;
}

export function previewSlug(baseSlug: string, prNumber: number): string {
	return `pr-${prNumber}-${baseSlug}`.slice(0, 63);
}

export function previewName(siteName: string, prNumber: number): string {
	return `${siteName} (PR #${prNumber})`.slice(0, 255);
}

export function isPreviewSlug(slug: string, prNumber: number, baseSlug: string): boolean {
	return slug === previewSlug(baseSlug, prNumber);
}

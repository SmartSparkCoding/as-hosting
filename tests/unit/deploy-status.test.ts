import { describe, expect, it } from 'vitest';
import { deployTargetUrl } from '$lib/server/github/deploy-status';

describe('deployTargetUrl', () => {
	it('tags a site URL with the deploy campaign', () => {
		const url = new URL(deployTargetUrl('https://as-hosting.dino.icu/bulut/', 2));
		expect(url.searchParams.get('utm_source')).toBe('github');
		expect(url.searchParams.get('utm_campaign')).toBe('deploy-2');
		expect(url.pathname).toBe('/bulut/');
	});

	it('keeps an existing query string', () => {
		const url = new URL(deployTargetUrl('https://example.com/site/?ref=newsletter', 12));
		expect(url.searchParams.get('ref')).toBe('newsletter');
		expect(url.searchParams.get('utm_campaign')).toBe('deploy-12');
	});

	it('overrides a campaign that was already there', () => {
		const url = new URL(deployTargetUrl('https://example.com/site/?utm_campaign=old', 3));
		expect(url.searchParams.getAll('utm_campaign')).toEqual(['deploy-3']);
	});

	it('hands back the original string when the URL is unusable', () => {
		expect(deployTargetUrl('not a url', 1)).toBe('not a url');
	});
});

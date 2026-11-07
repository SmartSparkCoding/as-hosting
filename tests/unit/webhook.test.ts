import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
	defaultBranchOf,
	previewName,
	previewSlug,
	repoFullName,
	verifyWebhookSignature,
} from '$lib/server/github/webhook';

const SECRET = 's3cret';
const body = JSON.stringify({ ref: 'refs/heads/main' });
const good = `sha256=${createHmac('sha256', SECRET).update(body, 'utf8').digest('hex')}`;

describe('verifyWebhookSignature', () => {
	it('accepts a signature GitHub would send', () => {
		expect(verifyWebhookSignature(body, good, SECRET)).toBe(true);
	});

	it('rejects a tampered body', () => {
		expect(verifyWebhookSignature(`${body} `, good, SECRET)).toBe(false);
	});

	it('rejects the wrong secret and a missing signature', () => {
		expect(verifyWebhookSignature(body, good, 'other')).toBe(false);
		expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
		expect(verifyWebhookSignature(body, '', SECRET)).toBe(false);
	});

	it('rejects a bare digest with no sha256= prefix', () => {
		expect(verifyWebhookSignature(body, good.slice(7), SECRET)).toBe(false);
	});

	it('refuses to work without a secret', () => {
		expect(verifyWebhookSignature(body, good, '')).toBe(false);
	});
});

describe('repoFullName', () => {
	it('reads owner/repo out of a clone URL', () => {
		expect(repoFullName('https://github.com/ashackclub/bulut')).toBe('ashackclub/bulut');
		expect(repoFullName('https://github.com/AshackClub/Bulut.git')).toBe('ashackclub/bulut');
	});

	it('accepts a bare full name and rejects everything else', () => {
		expect(repoFullName('ashackclub/bulut')).toBe('ashackclub/bulut');
		expect(repoFullName('https://gitlab.com/ashackclub/bulut')).toBeNull();
		expect(repoFullName('not a repo')).toBeNull();
		expect(repoFullName(null)).toBeNull();
	});
});

describe('previews', () => {
	it('names previews after the pull request', () => {
		expect(previewSlug('bulut', 12)).toBe('pr-12-bulut');
		expect(previewName('Bulut', 12)).toBe('Bulut (PR #12)');
	});

	it('keeps preview slugs inside the slug length limit', () => {
		expect(previewSlug('a'.repeat(90), 3).length).toBeLessThanOrEqual(63);
	});

	it('reads the default branch, falling back to null', () => {
		expect(defaultBranchOf({ repository: { default_branch: 'main' } })).toBe('main');
		expect(defaultBranchOf({ repository: {} })).toBeNull();
		expect(defaultBranchOf(null)).toBeNull();
	});
});

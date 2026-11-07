import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkLoginRateLimit, resetLoginRateLimit } from '$lib/server/auth/rate-limit';

describe('Rate limiting', () => {
	beforeEach(() => {
		// Reset module state by importing fresh
		vi.resetModules();
	});

	it('allows first attempt', () => {
		const result = checkLoginRateLimit('test-user');
		expect(result.allowed).toBe(true);
	});

	it('blocks after too many attempts', () => {
		for (let i = 0; i < 5; i++) {
			checkLoginRateLimit('rate-limit-user');
		}
		const result = checkLoginRateLimit('rate-limit-user');
		expect(result.allowed).toBe(false);
		expect(result.retryAfter).toBeGreaterThan(0);
	});

	it('tracks different users separately', () => {
		for (let i = 0; i < 5; i++) {
			checkLoginRateLimit('user-a');
		}
		const resultA = checkLoginRateLimit('user-a');
		const resultB = checkLoginRateLimit('user-b');
		expect(resultA.allowed).toBe(false);
		expect(resultB.allowed).toBe(true);
	});
	it('forgets a lockout once the password was right', () => {
		for (let i = 0; i < 4; i++) {
			checkLoginRateLimit('reset-user');
		}
		expect(checkLoginRateLimit('reset-user').allowed).toBe(true);

		resetLoginRateLimit('reset-user');

		expect(checkLoginRateLimit('reset-user').allowed).toBe(true);
		expect(checkLoginRateLimit('reset-user').allowed).toBe(true);
	});
});

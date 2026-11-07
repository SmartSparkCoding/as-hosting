const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface AttemptRecord {
	count: number;
	resetAt: number;
}

const attempts = new Map<string, AttemptRecord>();

function cleanup(): void {
	const now = Date.now();
	for (const [key, record] of attempts) {
		if (now > record.resetAt) {
			attempts.delete(key);
		}
	}
}

/**
 * Clears the counter for an identifier after a successful sign in.
 *
 * The limiter counts attempts before it knows whether the password was right,
 * so without this a member who signs in from a few devices, or retries while
 * the site is half broken, burns their five tries and gets locked out even
 * though every attempt succeeded.
 */
export function resetLoginRateLimit(identifier: string): void {
	attempts.delete(identifier);
}

export function checkLoginRateLimit(identifier: string): { allowed: boolean; retryAfter?: number } {
	cleanup();

	const now = Date.now();
	const record = attempts.get(identifier);

	if (!record || now > record.resetAt) {
		attempts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
		return { allowed: true };
	}

	if (record.count >= MAX_ATTEMPTS) {
		const retryAfterSeconds = Math.ceil((record.resetAt - now) / 1000);
		return { allowed: false, retryAfter: retryAfterSeconds };
	}

	record.count++;
	return { allowed: true };
}

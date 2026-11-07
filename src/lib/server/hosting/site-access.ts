import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { verifyPassword } from '../auth/password';
import { checkLoginRateLimit } from '../auth/rate-limit';

/**
 * Shared-password protection for hosted sites.
 *
 * The access cookie holds an HMAC of (slug + password hash), not a session id,
 * so there is nothing to store server-side and changing the password
 * invalidates every existing cookie automatically.
 */

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

function cookieSecret(): string {
	return env.SESSION_SECRET || 'insecure-development-secret';
}

export function siteAccessCookieName(slug: string): string {
	return `site-access-${slug}`;
}

export function signSiteAccess(slug: string, passwordHash: string): string {
	return createHmac('sha256', cookieSecret())
		.update(`${slug}|${passwordHash}`)
		.digest('hex')
		.slice(0, 40);
}

function safeEqual(a: string, b: string): boolean {
	const left = Buffer.from(a);
	const right = Buffer.from(b);
	if (left.length !== right.length) return false;
	return timingSafeEqual(left, right);
}

export function hasSiteAccess(
	cookies: { get(name: string): string | undefined },
	slug: string,
	passwordHash: string | null
): boolean {
	// A PASSWORD site with no hash set would otherwise be unlocked by anyone.
	if (!passwordHash) return false;

	const token = cookies.get(siteAccessCookieName(slug));
	if (!token) return false;

	return safeEqual(token, signSiteAccess(slug, passwordHash));
}

export function buildSiteAccessCookie(slug: string, passwordHash: string): string {
	const parts = [
		`${siteAccessCookieName(slug)}=${signSiteAccess(slug, passwordHash)}`,
		`Path=/${slug}`,
		`Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
		'HttpOnly',
		'SameSite=Lax'
	];

	if (env.NODE_ENV === 'production') parts.push('Secure');

	return parts.join('; ');
}

export async function checkSitePassword(
	slug: string,
	password: string,
	passwordHash: string | null,
	clientAddress: string
): Promise<{ ok: boolean; retryAfter?: number }> {
	if (!passwordHash) return { ok: false };

	const limit = checkLoginRateLimit(`site-access:${slug}:${clientAddress}`);
	if (!limit.allowed) return { ok: false, retryAfter: limit.retryAfter };

	try {
		const ok = await verifyPassword(password, passwordHash);
		return { ok };
	} catch {
		return { ok: false };
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Tiny standalone page so a protected site never loads any of its own HTML
 * (and so the gate also works with JavaScript disabled).
 */
export function renderPasswordPage(options: {
	siteName: string;
	next: string;
	error?: string | null;
}): string {
	const action = escapeHtml(options.next);
	const error = options.error
		? `<p class="error">${escapeHtml(options.error)}</p>`
		: '';

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(options.siteName)}</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
	margin: 0;
	min-height: 100vh;
	display: grid;
	place-items: center;
	padding: 24px;
	background: #09090b;
	color: #e4e4e7;
	font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.card {
	width: 100%;
	max-width: 22rem;
	background: #18181b;
	border: 1px solid #27272a;
	border-radius: 14px;
	padding: 28px;
}
h1 { margin: 0 0 6px; font-size: 1.05rem; letter-spacing: -0.01em; }
p { margin: 0 0 18px; color: #a1a1aa; font-size: 0.875rem; }
label { display: block; margin-bottom: 6px; font-size: 0.75rem; color: #a1a1aa; }
input {
	width: 100%;
	padding: 10px 12px;
	border-radius: 8px;
	border: 1px solid #3f3f46;
	background: #09090b;
	color: #e4e4e7;
	font-size: 0.9rem;
}
input:focus { outline: 2px solid #10b981; outline-offset: 1px; border-color: transparent; }
button {
	width: 100%;
	margin-top: 14px;
	padding: 10px 12px;
	border: 0;
	border-radius: 8px;
	background: #10b981;
	color: #052e1b;
	font-weight: 600;
	font-size: 0.9rem;
	cursor: pointer;
}
button:hover { background: #34d399; }
.error {
	margin: 0 0 14px;
	padding: 9px 11px;
	border-radius: 8px;
	background: rgba(248, 113, 113, 0.1);
	border: 1px solid rgba(248, 113, 113, 0.25);
	color: #fca5a5;
	font-size: 0.8rem;
}
.foot { margin: 18px 0 0; font-size: 0.7rem; color: #52525b; text-align: center; }
</style>
</head>
<body>
<form class="card" method="POST" action="${action}">
	<h1>${escapeHtml(options.siteName)}</h1>
	<p>This site is password protected.</p>
	${error}
	<label for="password">Password</label>
	<input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
	<button type="submit">Open site</button>
	<p class="foot">Hosted with AS Hosting</p>
</form>
</body>
</html>`;
}

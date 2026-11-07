import { redirect, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { getAllActiveLoginUsers, getUserById, updatePassword } from '$lib/server/services/user.service';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession } from '$lib/server/auth/session';
import { checkLoginRateLimit, resetLoginRateLimit } from '$lib/server/auth/rate-limit';
import { logAudit, AuditAction } from '$lib/server/services/audit.service';
import { SESSION_COOKIE_NAME } from '$lib/constants';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) throw redirect(302, '/dashboard');

	const allUsers = await getAllActiveLoginUsers();
	if (allUsers.length === 0) throw redirect(302, '/setup');

	return {
		users: allUsers.map((u) => ({
			id: u.id,
			name: u.name,
			passwordConfigured: u.passwordConfigured
		}))
	};
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const formData = await request.formData();
		const name = formData.get('name') as string;
		const password = formData.get('password') as string;

		if (!name) return fail(400, { error: 'Please select your name' });

		const rateLimit = checkLoginRateLimit(name);
		if (!rateLimit.allowed) {
			return fail(429, {
				error: 'Too many login attempts. Please wait a moment and try again.'
			});
		}

		const [user] = await db.select().from(users).where(eq(users.name, name)).limit(1);
		if (!user || !user.active) return fail(400, { error: 'User not found' });

		if (!user.passwordConfigured) {
			return fail(400, { needsPassword: true, userName: user.name, userId: user.id });
		}

		if (!password) return fail(400, { error: 'Please enter your password' });
		if (!user.passwordHash)
			return fail(400, { error: 'Account issue — please contact the leader.' });

		const valid = await verifyPassword(password, user.passwordHash);
		if (!valid) return fail(400, { error: 'Incorrect password' });

		// A good sign in should not count towards the lockout budget.
		resetLoginRateLimit(name);

		const sessionId = await createSession(user.id);
		cookies.set(SESSION_COOKIE_NAME, sessionId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: 30 * 24 * 60 * 60
		});

		await logAudit(user.id, AuditAction.LOGIN_SUCCESS);
		throw redirect(302, '/dashboard');
	},

	createPassword: async ({ request, cookies }) => {
		const formData = await request.formData();
		const userId = formData.get('userId') as string;
		const password = formData.get('password') as string;
		const confirmPassword = formData.get('confirmPassword') as string;

		if (!userId) return fail(400, { error: 'Missing user' });
		if (!password || password.length < 8)
			return fail(400, {
				error: 'Password must be at least 8 characters',
				needsPassword: true,
				userId
			});
		if (password !== confirmPassword)
			return fail(400, {
				error: 'Passwords do not match',
				needsPassword: true,
				userId
			});

		await updatePassword(userId, password);
		const user = await getUserById(userId);
		if (!user) return fail(500, { error: 'Something went wrong' });

		const sessionId = await createSession(user.id);
		cookies.set(SESSION_COOKIE_NAME, sessionId, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: process.env.NODE_ENV === 'production',
			maxAge: 30 * 24 * 60 * 60
		});

		await logAudit(user.id, AuditAction.LOGIN_SUCCESS);
		throw redirect(302, '/dashboard');
	}
};

import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { auditLogs, users } from '../db/schema';

export const AuditAction = {
	USER_CREATED: 'user.created',
	USER_DEACTIVATED: 'user.deactivated',
	USER_PASSWORD_RESET: 'user.password_reset',
	USER_PASSWORD_CHANGED: 'user.password_changed',
	WEBSITE_CREATED: 'website.created',
	WEBSITE_UPDATED: 'website.updated',
	WEBSITE_ARCHIVED: 'website.archived',
	WEBSITE_RELAUNCHED: 'website.relaunched',
	WEBSITE_DELETED: 'website.deleted',
	WEBSITE_DEPLOYED: 'website.deployed',
	WEBSITE_ROLLED_BACK: 'website.rolled_back',
	WEBSITE_VISIBILITY_CHANGED: 'website.visibility_changed',
	WEBSITE_ACCESS_PASSWORD_CHANGED: 'website.access_password_changed',
	SESSION_CREATED: 'session.created',
	SESSION_DELETED: 'session.deleted',
	LOGIN_SUCCESS: 'login.success',
	LOGIN_FAILED: 'login.failed'
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];

export async function logAudit(userId: string, action: AuditActionValue, details?: string) {
	await db.insert(auditLogs).values({
		userId,
		action,
		details: details ?? null
	});
}

export async function getAuditLogs(limit: number = 50) {
	const logs = await db
		.select({
			id: auditLogs.id,
			userId: auditLogs.userId,
			action: auditLogs.action,
			details: auditLogs.details,
			createdAt: auditLogs.createdAt,
			userName: users.name
		})
		.from(auditLogs)
		.leftJoin(users, eq(auditLogs.userId, users.id))
		.orderBy(desc(auditLogs.createdAt))
		.limit(limit);

	return logs;
}

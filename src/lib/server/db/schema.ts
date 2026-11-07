import {
	pgTable,
	uuid,
	varchar,
	text,
	boolean,
	timestamp,
	integer,
	pgEnum,
	bigserial,
	index
} from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', ['MAIN_LEADER', 'CO_LEADER', 'AMBASSADOR']);
export const ambassadorPermEnum = pgEnum('ambassador_permission', ['VIEWER', 'LEADER']);
export const websiteStatusEnum = pgEnum('website_status', ['BUILDING', 'ACTIVE', 'ARCHIVED', 'FAILED']);
export const siteVisibilityEnum = pgEnum('site_visibility', ['PUBLIC', 'UNLISTED', 'PASSWORD']);

export const users = pgTable('users', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	slackId: varchar('slack_id', { length: 50 }).notNull(),
	role: userRoleEnum('role').notNull(),
	ambassadorPermission: ambassadorPermEnum('ambassador_permission'),
	passwordHash: text('password_hash'),
	passwordConfigured: boolean('password_configured').notNull().default(false),
	slackNotificationsEnabled: boolean('slack_notifications_enabled').notNull().default(true),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	id: varchar('id', { length: 255 }).primaryKey(),
	userId: uuid('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

export const websites = pgTable('websites', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: varchar('name', { length: 255 }).notNull(),
	slug: varchar('slug', { length: 255 }).notNull().unique(),
	gitUrl: text('git_url').notNull(),
	status: websiteStatusEnum('status').notNull().default('BUILDING'),
	storageBytes: integer('storage_bytes').notNull().default(0),
	visibility: siteVisibilityEnum('visibility').notNull().default('PUBLIC'),
	accessPasswordHash: text('access_password_hash'),
	showInPublicStats: boolean('show_in_public_stats').notNull().default(true),
	createdBy: uuid('created_by')
		.notNull()
		.references(() => users.id),
	expiresAt: timestamp('expires_at'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const deployments = pgTable('deployments', {
	id: uuid('id').primaryKey().defaultRandom(),
	websiteId: uuid('website_id')
		.notNull()
		.references(() => websites.id, { onDelete: 'cascade' }),
	deployedBy: uuid('deployed_by')
		.references(() => users.id),
	success: boolean('success').notNull(),
	log: text('log').notNull().default(''),
	errorMessage: text('error_message'),
	/** deploy | rollback | recovery */
	kind: varchar('kind', { length: 16 }).notNull().default('deploy'),
	release: varchar('release', { length: 64 }),
	commitSha: varchar('commit_sha', { length: 40 }),
	commitMessage: varchar('commit_message', { length: 255 }),
	/** 0-100 result of the static site checks, null when checks did not run */
	auditScore: integer('audit_score'),
	/** JSON array of { level, message } */
	auditIssues: text('audit_issues'),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

export const auditLogs = pgTable('audit_logs', {
	id: uuid('id').primaryKey().defaultRandom(),
	userId: uuid('user_id').references(() => users.id),
	action: varchar('action', { length: 100 }).notNull(),
	details: text('details'),
	createdAt: timestamp('created_at').notNull().defaultNow()
});

/**
 * Privacy-first analytics for hosted sites.
 *
 * No cookies, no raw IP addresses, no raw user-agent strings, no cross-site
 * identifiers. `visitorHash` is a truncated SHA-256 of (daily random salt +
 * IP + user-agent); the salt lives only in memory and is discarded every day,
 * so old rows can never be tied back to a person or matched across days.
 * `type` is one of: pageview, engagement, outbound, download, not_found.
 */
export const analyticsEvents = pgTable(
	'analytics_events',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),
		websiteId: uuid('website_id')
			.notNull()
			.references(() => websites.id, { onDelete: 'cascade' }),
		type: varchar('type', { length: 20 }).notNull().default('pageview'),
		path: varchar('path', { length: 512 }).notNull().default('/'),
		host: varchar('host', { length: 255 }),
		referrerHost: varchar('referrer_host', { length: 255 }),
		referrerType: varchar('referrer_type', { length: 16 }),
		utmSource: varchar('utm_source', { length: 64 }),
		utmMedium: varchar('utm_medium', { length: 64 }),
		utmCampaign: varchar('utm_campaign', { length: 64 }),
		country: varchar('country', { length: 2 }),
		language: varchar('language', { length: 35 }),
		browser: varchar('browser', { length: 64 }),
		browserVersion: varchar('browser_version', { length: 16 }),
		os: varchar('os', { length: 64 }),
		device: varchar('device', { length: 16 }),
		visitorHash: varchar('visitor_hash', { length: 32 }),
		screenWidth: integer('screen_width'),
		screenHeight: integer('screen_height'),
		durationSeconds: integer('duration_seconds'),
		scrollDepth: integer('scroll_depth'),
		targetHost: varchar('target_host', { length: 255 }),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(table) => [
		index('analytics_events_website_time_idx').on(table.websiteId, table.createdAt),
		index('analytics_events_website_type_time_idx').on(
			table.websiteId,
			table.type,
			table.createdAt
		),
		index('analytics_events_website_visitor_idx').on(
			table.websiteId,
			table.visitorHash,
			table.createdAt
		),
		index('analytics_events_website_path_idx').on(table.websiteId, table.path)
	]
);

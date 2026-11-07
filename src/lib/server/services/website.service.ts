import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db';
import { websites, deployments } from '../db/schema';

export async function createWebsite(
	name: string,
	slug: string,
	gitUrl: string,
	createdBy: string
) {
	const [site] = await db
		.insert(websites)
		.values({ name, slug, gitUrl, createdBy })
		.returning();
	return site;
}

export async function getWebsiteById(id: string) {
	const [site] = await db.select().from(websites).where(eq(websites.id, id)).limit(1);
	return site ?? null;
}

export async function getWebsiteBySlug(slug: string) {
	const [site] = await db.select().from(websites).where(eq(websites.slug, slug)).limit(1);
	return site ?? null;
}

export async function getAllWebsites() {
	return db.select().from(websites).orderBy(desc(websites.createdAt));
}

export async function getActiveWebsites() {
	return db
		.select()
		.from(websites)
		.where(eq(websites.status, 'ACTIVE'))
		.orderBy(desc(websites.createdAt));
}

export async function getArchivedWebsites() {
	return db
		.select()
		.from(websites)
		.where(eq(websites.status, 'ARCHIVED'))
		.orderBy(desc(websites.createdAt));
}

export async function updateWebsiteStatus(
	id: string,
	status: 'BUILDING' | 'ACTIVE' | 'ARCHIVED' | 'FAILED'
) {
	await db
		.update(websites)
		.set({ status, updatedAt: new Date() })
		.where(eq(websites.id, id));
}

export async function updateWebsiteStorage(id: string, bytes: number) {
	await db
		.update(websites)
		.set({ storageBytes: bytes, updatedAt: new Date() })
		.where(eq(websites.id, id));
}

export async function archiveWebsite(id: string) {
	await db
		.update(websites)
		.set({ status: 'ARCHIVED', updatedAt: new Date() })
		.where(eq(websites.id, id));
}

export async function relaunchWebsite(id: string, expiresAt?: Date) {
	await db
		.update(websites)
		.set({ status: 'BUILDING', expiresAt: expiresAt ?? null, updatedAt: new Date() })
		.where(eq(websites.id, id));
}

export async function deleteWebsite(id: string) {
	const site = await getWebsiteById(id);
	if (!site || site.status !== 'ARCHIVED') {
		throw new Error('Only archived websites can be deleted');
	}
	await db.delete(deployments).where(eq(deployments.websiteId, id));
	await db.delete(websites).where(eq(websites.id, id));
}

export async function checkSlugExists(slug: string): Promise<boolean> {
	const [site] = await db.select().from(websites).where(eq(websites.slug, slug)).limit(1);
	return !!site;
}

export type SiteVisibility = 'PUBLIC' | 'UNLISTED' | 'PASSWORD';

/**
 * PUBLIC: normal. UNLISTED: served, but noindex and kept out of public stats.
 * PASSWORD: visitors must enter a shared password before the site is served.
 */
export async function setWebsiteVisibility(
	id: string,
	visibility: SiteVisibility,
	accessPasswordHash: string | null
) {
	await db
		.update(websites)
		.set({ visibility, accessPasswordHash, updatedAt: new Date() })
		.where(eq(websites.id, id));
}

export async function setShowInPublicStats(id: string, showInPublicStats: boolean) {
	await db
		.update(websites)
		.set({ showInPublicStats, updatedAt: new Date() })
		.where(eq(websites.id, id));
}

/** Active sites that may appear in the public club stats page. */
export async function getPublicStatsWebsiteIds() {
	const rows = await db
		.select({ id: websites.id })
		.from(websites)
		.where(
			and(
				eq(websites.status, 'ACTIVE'),
				eq(websites.visibility, 'PUBLIC'),
				eq(websites.showInPublicStats, true)
			)
		);
	return rows.map((row) => row.id);
}

/** Active, publicly listed sites that opted into the public club stats page. */
export async function getPublicStatsWebsites() {
	return db
		.select({ id: websites.id, name: websites.name, slug: websites.slug })
		.from(websites)
		.where(
			and(
				eq(websites.status, 'ACTIVE'),
				eq(websites.visibility, 'PUBLIC'),
				eq(websites.showInPublicStats, true)
			)
		);
}

export async function getStorageStats() {
	const allSites = await db
		.select()
		.from(websites)
		.where(eq(websites.status, 'ACTIVE'));

	const totalBytes = allSites.reduce((acc, site) => acc + site.storageBytes, 0);

	return {
		totalBytes,
		websites: allSites.map((site) => ({
			id: site.id,
			name: site.name,
			slug: site.slug,
			storageBytes: site.storageBytes
		}))
	};
}

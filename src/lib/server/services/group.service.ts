import { eq, asc, sql } from 'drizzle-orm';
import { db } from '../db';
import { siteGroups, websites } from '../db/schema';

/**
 * A section groups websites together: one workshop, one club year, one event.
 * Sections get an index page at /<slug> listing their sites, and the dashboard
 * shows them as a block instead of one long list.
 */
export interface SiteGroupSummary {
	id: string;
	name: string;
	slug: string;
	description: string | null;
	siteCount: number;
	activeCount: number;
}

export async function createGroup(
	name: string,
	slug: string,
	createdBy: string | null,
	description?: string | null
) {
	const [group] = await db
		.insert(siteGroups)
		.values({ name, slug, createdBy, description: description ?? null })
		.returning();
	return group;
}

export async function getGroupById(id: string) {
	const [group] = await db.select().from(siteGroups).where(eq(siteGroups.id, id)).limit(1);
	return group ?? null;
}

export async function getGroupBySlug(slug: string) {
	const [group] = await db.select().from(siteGroups).where(eq(siteGroups.slug, slug)).limit(1);
	return group ?? null;
}

export async function getAllGroups() {
	return db.select().from(siteGroups).orderBy(asc(siteGroups.name));
}

/** Sections with how many sites they hold, for the dashboard and websites list. */
export async function getGroupSummaries(): Promise<SiteGroupSummary[]> {
	const groups = await getAllGroups();
	const counts = await db
		.select({
			groupId: websites.groupId,
			siteCount: sql<number>`count(*)`,
			activeCount: sql<number>`count(*) filter (where ${websites.status} = 'ACTIVE')`
		})
		.from(websites)
		.where(sql`${websites.groupId} is not null`)
		.groupBy(websites.groupId);

	const byGroup = new Map(counts.map((row) => [row.groupId, row]));

	return groups.map((group) => ({
		id: group.id,
		name: group.name,
		slug: group.slug,
		description: group.description,
		siteCount: Number(byGroup.get(group.id)?.siteCount ?? 0),
		activeCount: Number(byGroup.get(group.id)?.activeCount ?? 0)
	}));
}

export async function updateGroup(id: string, name: string, description?: string | null) {
	await db
		.update(siteGroups)
		.set({ name, description: description ?? null, updatedAt: new Date() })
		.where(eq(siteGroups.id, id));
}

/** Removes the section. Its sites stay, they just become ungrouped (FK set null). */
export async function deleteGroup(id: string) {
	await db.delete(siteGroups).where(eq(siteGroups.id, id));
}

export async function setWebsiteGroup(websiteId: string, groupId: string | null) {
	await db
		.update(websites)
		.set({ groupId, updatedAt: new Date() })
		.where(eq(websites.id, websiteId));
}

/** Sites in a section, for the public index page and the dashboard. */
export async function getWebsitesInGroup(groupId: string) {
	return db
		.select()
		.from(websites)
		.where(eq(websites.groupId, groupId))
		.orderBy(asc(websites.name));
}

export async function checkGroupSlugExists(slug: string): Promise<boolean> {
	const [group] = await db
		.select({ id: siteGroups.id })
		.from(siteGroups)
		.where(eq(siteGroups.slug, slug))
		.limit(1);
	return !!group;
}

/** Slugs are shared between sites and sections, so a section can never shadow a site. */
export async function isSlugTaken(slug: string): Promise<boolean> {
	const [site] = await db
		.select({ id: websites.id })
		.from(websites)
		.where(eq(websites.slug, slug))
		.limit(1);
	if (site) return true;

	const [group] = await db
		.select({ id: siteGroups.id })
		.from(siteGroups)
		.where(eq(siteGroups.slug, slug))
		.limit(1);
	return !!group;
}

/** Every taken slug, for planning a bulk deploy in one query instead of N. */
export async function getTakenSlugs(): Promise<Set<string>> {
	const siteRows = await db.select({ slug: websites.slug }).from(websites);
	const groupRows = await db.select({ slug: siteGroups.slug }).from(siteGroups);
	return new Set([...siteRows.map((row) => row.slug), ...groupRows.map((row) => row.slug)]);
}

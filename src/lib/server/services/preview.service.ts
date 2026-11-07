import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { websites } from '$lib/server/db/schema';
import {
	createWebsite,
	getWebsiteById,
	archiveWebsite,
	checkSlugExists,
} from '$lib/server/services/website.service';
import { getTakenSlugs, setWebsiteGroup } from '$lib/server/services/group.service';
import { HostingStorage } from '$lib/server/hosting/storage';
import { redeployWebsite, type RedeployResult } from '$lib/server/services/redeploy.service';
import { previewName, previewSlug } from '$lib/server/github/webhook';

/**
 * Pull request previews: a push to a branch with an open PR gets its own
 * throwaway site at `pr-<number>-<slug>`, unlisted so it never shows up in
 * search or the club stats. Closing the PR archives the preview and keeps the
 * files, so a re-opened PR is a redeploy rather than a fresh clone.
 */

export interface PreviewResult {
	slug: string;
	websiteId: string;
	created: boolean;
	deploy?: RedeployResult;
}

export async function ensurePreviewSite(
	parentId: string,
	prNumber: number,
): Promise<PreviewResult | null> {
	const parent = await getWebsiteById(parentId);
	if (!parent) return null;

	const existing = await findPreview(parentId, prNumber);
	if (existing) {
		return { slug: existing.slug, websiteId: existing.id, created: false };
	}

	const base = previewSlug(parent.slug, prNumber);
	let slug = base;
	if (await checkSlugExists(slug)) {
		// A real site already owns this name; park the preview next to it.
		const taken = await getTakenSlugs();
		let n = 2;
		while (taken.has(slug) && n < 20) {
			slug = `${base}-${n}`.slice(0, 63);
			n += 1;
		}
	}

	const created = await createWebsite(
		previewName(parent.name, prNumber),
		slug,
		parent.gitUrl,
		parent.createdBy,
	);
	await db
		.update(websites)
		.set({
			previewOfId: parent.id,
			previewPr: prNumber,
			visibility: 'UNLISTED',
			showInPublicStats: false,
		})
		.where(eq(websites.id, created.id));
	if (parent.groupId) await setWebsiteGroup(created.id, parent.groupId);

	return { slug, websiteId: created.id, created: true };
}

export async function findPreview(parentId: string, prNumber: number) {
	const rows = await db
		.select()
		.from(websites)
		.where(and(eq(websites.previewOfId, parentId), eq(websites.previewPr, prNumber)))
		.limit(1);
	return rows[0] ?? null;
}

export async function deployPreview(
	parentId: string,
	prNumber: number,
): Promise<PreviewResult | null> {
	const preview = await ensurePreviewSite(parentId, prNumber);
	if (!preview) return null;
	const deploy = await redeployWebsite({
		websiteId: preview.websiteId,
		triggeredBy: null,
		kind: 'preview',
		auditDetails: `Preview deploy for PR #${prNumber}`,
		silentOnFailure: true,
	});
	return { ...preview, deploy };
}

export async function closePreviews(parentId: string, prNumber: number): Promise<string[]> {
	const rows = await db
		.select()
		.from(websites)
		.where(and(eq(websites.previewOfId, parentId), eq(websites.previewPr, prNumber)));

	const closed: string[] = [];
	const storage = new HostingStorage();
	for (const row of rows) {
		try {
			await storage.archive(row.id);
		} catch {
			// Nothing on disk to archive; the row still goes away.
		}
		await archiveWebsite(row.id);
		closed.push(row.slug);
	}
	return closed;
}

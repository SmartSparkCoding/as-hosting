import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { searchDocuments, websites } from '$lib/server/db/schema';
import { HostingStorage } from '$lib/server/hosting/storage';
import {
	extractTitle,
	htmlToText,
	isIndexableFile,
	pagePathFromFile,
	renderSnippet,
	truncateText,
} from '$lib/server/hosting/text-extract';

export const MAX_PAGES_PER_SITE = 200;
export const MAX_BODY_CHARS = 20000;
export const MAX_RESULTS = 40;
export const MIN_QUERY_LENGTH = 2;

export interface SearchHit {
	websiteId: string;
	siteName: string;
	slug: string;
	path: string;
	title: string;
	snippet: string;
}

export interface IndexStats {
	pages: number;
	sites: number;
	lastIndexedAt: Date | null;
}

export interface ReindexSummary {
	sites: number;
	pages: number;
	failed: number;
}

const storage = new HostingStorage();

interface PageRecord {
	path: string;
	title: string;
	body: string;
}

/** Walks a release directory and returns the readable text of every page. */
export async function collectPages(
	rootDir: string,
	fallbackTitle: string,
	maxPages = MAX_PAGES_PER_SITE,
): Promise<PageRecord[]> {
	const pages: PageRecord[] = [];

	async function walk(dir: string) {
		if (pages.length >= maxPages) return;
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			if (pages.length >= maxPages) return;
			if (entry.name.startsWith('.')) continue;

			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				await walk(full);
				continue;
			}
			if (!isIndexableFile(entry.name)) continue;

			let html: string;
			try {
				html = await readFile(full, 'utf8');
			} catch {
				continue;
			}

			const relativePath = relative(rootDir, full).split(sep).join('/');
			const path = pagePathFromFile(relativePath);
			const body = truncateText(htmlToText(html), MAX_BODY_CHARS);
			pages.push({ path, title: extractTitle(html, fallbackTitle), body });
		}
	}

	await walk(rootDir);
	return pages;
}

/**
 * Rebuilds the index for one site from its current release. Sites that are not
 * active and public are removed from the index instead, so an unlisted or
 * password protected site can never show up in club search results.
 */
export async function reindexWebsite(websiteId: string): Promise<number> {
	const [site] = await db.select().from(websites).where(eq(websites.id, websiteId)).limit(1);
	if (!site || site.status !== 'ACTIVE' || site.visibility !== 'PUBLIC') {
		await removeFromIndex(websiteId);
		return 0;
	}

	const pages = await collectPages(storage.getServePath(websiteId), site.name);

	await db.delete(searchDocuments).where(eq(searchDocuments.websiteId, websiteId));
	if (pages.length === 0) return 0;

	for (let i = 0; i < pages.length; i += 50) {
		await db.insert(searchDocuments).values(
			pages.slice(i, i + 50).map((page) => ({
				websiteId,
				path: page.path,
				title: page.title,
				body: page.body,
			})),
		);
	}

	return pages.length;
}

export async function removeFromIndex(websiteId: string): Promise<void> {
	await db.delete(searchDocuments).where(eq(searchDocuments.websiteId, websiteId));
}

/** Rebuilds the whole index. One bad site never stops the rest. */
export async function reindexAll(): Promise<ReindexSummary> {
	const sites = await db
		.select({ id: websites.id })
		.from(websites)
		.where(and(eq(websites.status, 'ACTIVE'), eq(websites.visibility, 'PUBLIC')));

	const summary: ReindexSummary = { sites: 0, pages: 0, failed: 0 };

	for (const site of sites) {
		try {
			summary.pages += await reindexWebsite(site.id);
			summary.sites += 1;
		} catch {
			summary.failed += 1;
		}
	}

	return summary;
}

export async function getIndexStats(): Promise<IndexStats> {
	const rows = await db
		.select({
			pages: sql<number>`count(*)::int`,
			sites: sql<number>`count(distinct ${searchDocuments.websiteId})::int`,
			lastIndexedAt: sql<Date | null>`max(${searchDocuments.indexedAt})`,
		})
		.from(searchDocuments);

	const row = rows[0];
	return {
		pages: Number(row?.pages ?? 0),
		sites: Number(row?.sites ?? 0),
		lastIndexedAt: row?.lastIndexedAt ? new Date(row.lastIndexedAt) : null,
	};
}

/**
 * Full text search over indexed pages. Only active public sites are searched,
 * so unlisted and password protected pages stay out of the results even if a
 * row is left over from an earlier deploy.
 */
export async function searchSites(query: string, limit = MAX_RESULTS): Promise<SearchHit[]> {
	const trimmed = query.trim();
	if (trimmed.length < MIN_QUERY_LENGTH) return [];

	const rows = await db.execute(sql`
		select
			d.website_id as website_id,
			w.name as site_name,
			w.slug as slug,
			d.path as path,
			d.title as title,
			ts_headline(
				'english',
				d.body,
				websearch_to_tsquery('english', ${trimmed}),
				'StartSel=[[H]], StopSel=[[/H]], MaxFragments=2, MaxWords=24, MinWords=6, FragmentDelimiter= ... '
			) as snippet,
			ts_rank(
				to_tsvector('english', d.title || ' ' || d.body),
				websearch_to_tsquery('english', ${trimmed})
			) as rank
		from search_documents d
		join websites w on w.id = d.website_id
		where
			w.status = 'ACTIVE'
			and w.visibility = 'PUBLIC'
			and to_tsvector('english', d.title || ' ' || d.body) @@ websearch_to_tsquery('english', ${trimmed})
		order by rank desc, w.name asc, d.path asc
		limit ${limit}
	`);

	return (rows as unknown as Record<string, unknown>[]).map((row) => ({
		websiteId: String(row.website_id),
		siteName: String(row.site_name),
		slug: String(row.slug),
		path: String(row.path),
		title: String(row.title),
		snippet: renderSnippet(String(row.snippet ?? '')),
	}));
}

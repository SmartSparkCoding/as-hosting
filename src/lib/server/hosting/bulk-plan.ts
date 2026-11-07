/**
 * Pure helpers for the bulk deploy form. Keeping the parsing and naming rules
 * here (instead of inside the form action) makes them easy to unit test and
 * keeps the action focused on talking to the database and the deployer.
 */
import { normalizeSlug } from '$lib/utils';

/** Hard cap on how many repositories one bulk deploy may submit. */
export const MAX_BULK_REPOS = 25;

/** How many sites we clone and build at the same time. */
export const BULK_CONCURRENCY = 3;

/**
 * Split a pasted textarea into repository URLs: one per line, blank lines and
 * `#` comments dropped, duplicates removed, and capped at MAX_BULK_REPOS.
 */
export function parseRepoLines(input: string, max = MAX_BULK_REPOS): string[] {
	const seen = new Set<string>();
	const lines: string[] = [];

	for (const raw of input.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;

		const key = line.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '');
		if (seen.has(key)) continue;

		seen.add(key);
		lines.push(line);
		if (lines.length >= max) break;
	}

	return lines;
}

/**
 * Turn a repository name into something readable for the site title:
 * `jeffs-amazing-website` becomes `Jeffs Amazing Website`.
 */
export function nameFromRepo(repo: string): string {
	const cleaned = repo
		.replace(/\.git$/i, '')
		.replace(/[-_]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	if (!cleaned) return repo;

	return cleaned
		.split(' ')
		.map((word) => (word.length <= 3 && word === word.toUpperCase() ? word : word.charAt(0).toUpperCase() + word.slice(1)))
		.join(' ');
}

/** The slug we would like to use for a repository, before collisions. */
export function slugFromRepo(repo: string): string {
	return normalizeSlug(repo.replace(/\.git$/i, ''));
}

/**
 * First free slug: `bulut`, then `bulut-2`, `bulut-3`, ... Two sites from the
 * same batch never fight over the same name because the caller adds each
 * result to `taken` as it goes.
 */
export function uniqueSlug(base: string, taken: Set<string>, maxAttempts = 50): string {
	if (!taken.has(base)) return base;

	for (let n = 2; n <= maxAttempts; n += 1) {
		const candidate = `${base}-${n}`;
		if (!taken.has(candidate)) return candidate;
	}

	return `${base}-${Date.now().toString(36)}`;
}

/** Run `worker` over `items`, at most `limit` at a time, keeping input order. */
export async function mapWithConcurrency<T, R>(
	items: T[],
	limit: number,
	worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;

	const runners = new Array(Math.max(1, Math.min(limit, items.length))).fill(null).map(async () => {
		while (next < items.length) {
			const index = next;
			next += 1;
			results[index] = await worker(items[index], index);
		}
	});

	await Promise.all(runners);

	return results;
}

/**
 * Static checks run on every deploy.
 *
 * This is not Lighthouse: measuring real Core Web Vitals needs headless Chrome
 * and a live URL, which the deploy pipeline does not have. These are cheap,
 * deterministic checks over the cloned files that catch the things club sites
 * actually get wrong: broken relative links, missing viewport meta, giant
 * images, and unminified assets.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';

export type AuditLevel = 'error' | 'warn' | 'info';

export interface AuditIssue {
	level: AuditLevel;
	message: string;
}

export interface SiteAudit {
	score: number;
	issues: AuditIssue[];
	bytes: number;
	files: number;
}

const MAX_SCANNED_HTML = 10;
const MAX_LINK_CHECKS = 250;
const LARGE_IMAGE_BYTES = 1_000_000;
const LARGE_ASSET_BYTES = 250_000;
const LARGE_HTML_BYTES = 150_000;
const TOTAL_BUDGET_BYTES = 25_000_000;

const PENALTY: Record<AuditLevel, number> = { error: 15, warn: 7, info: 3 };

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg', '.bmp']);
const ASSET_EXT = new Set(['.js', '.css']);

interface WalkResult {
	files: { path: string; size: number }[];
	bytes: number;
}

async function walk(dir: string, root: string, depth = 0): Promise<WalkResult> {
	const out: WalkResult = { files: [], bytes: 0 };
	if (depth > 8) return out;

	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out;
	}

	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === '.git' || entry.name === 'node_modules') continue;
			const nested = await walk(full, root, depth + 1);
			out.files.push(...nested.files);
			out.bytes += nested.bytes;
		} else if (entry.isFile()) {
			let size = 0;
			try {
				size = (await stat(full)).size;
			} catch {
				continue;
			}
			out.files.push({ path: relative(root, full), size });
			out.bytes += size;
		}
	}

	return out;
}

function extractAttributes(html: string, attribute: 'href' | 'src'): string[] {
	const values: string[] = [];
	const re = new RegExp(`${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'gi');
	let match: RegExpExecArray | null;
	while ((match = re.exec(html)) !== null) {
		const value = match[2] ?? match[3] ?? '';
		values.push(value.trim());
	}
	return values;
}

function isExternalLink(value: string): boolean {
	return (
		!value ||
		value.startsWith('#') ||
		value.startsWith('//') ||
		/^[a-z][a-z0-9+.-]*:/i.test(value) ||
		value.startsWith('{{') ||
		value.includes('${')
	);
}

export async function auditStaticSite(dir: string): Promise<SiteAudit> {
	const issues: AuditIssue[] = [];
	const add = (level: AuditLevel, message: string) => issues.push({ level, message });

	const { files, bytes } = await walk(dir, dir);
	const filePaths = new Set(files.map((file) => file.path.split('\\').join('/')));

	let indexHtml = '';
	try {
		indexHtml = await readFile(join(dir, 'index.html'), 'utf8');
	} catch {
		add('error', 'index.html could not be read.');
	}

	if (indexHtml) {
		if (!/<title[^>]*>\s*\S/i.test(indexHtml)) {
			add('warn', 'index.html has no <title>, so the browser tab and search results are blank.');
		}
		if (!/<meta[^>]+name=["']viewport["']/i.test(indexHtml)) {
			add('warn', 'No <meta name="viewport"> tag, so phones will render a zoomed-out desktop layout.');
		}
		if (!/<meta[^>]+name=["']description["']/i.test(indexHtml)) {
			add('info', 'No meta description. Search engines will invent one from the page body.');
		}
		if (!/<link[^>]+rel=["'][^"']*icon[^"']*["']/i.test(indexHtml)) {
			add('info', 'No favicon link, so link previews and tabs fall back to a blank icon.');
		}
		if (Buffer.byteLength(indexHtml, 'utf8') > LARGE_HTML_BYTES) {
			add('warn', `index.html is ${Math.round(Buffer.byteLength(indexHtml, 'utf8') / 1024)} KB of HTML.`);
		}
	}

	// Broken relative links from the pages we scan.
	const htmlFiles = files
		.filter((file) => file.path.toLowerCase().endsWith('.html'))
		.slice(0, MAX_SCANNED_HTML);

	let checks = 0;
	const seen = new Set<string>();
	for (const file of htmlFiles) {
		if (checks >= MAX_LINK_CHECKS) break;

		let html = '';
		try {
			html = await readFile(join(dir, file.path), 'utf8');
		} catch {
			continue;
		}

		const values = [...extractAttributes(html, 'href'), ...extractAttributes(html, 'src')];
		for (const value of values) {
			if (isExternalLink(value)) continue;
			if (++checks > MAX_LINK_CHECKS) break;

			const clean = value.split('#')[0].split('?')[0];
			if (!clean) continue;

			const target = clean.startsWith('/')
				? clean.slice(1)
				: relative(dir, resolve(dirname(join(dir, file.path)), clean)).split('\\').join('/');

			const normalised = target.replace(/^\.\//, '');
			const key = `${file.path}::${normalised}`;
			if (seen.has(key)) continue;
			seen.add(key);

			const found =
				filePaths.has(normalised) ||
				filePaths.has(`${normalised}/index.html`) ||
				[...filePaths].some((candidate) => candidate.toLowerCase() === normalised.toLowerCase());

			if (!found) {
				add('warn', `${file.path} links to "${value}" but that file is not in the repository.`);
			}
		}
	}

	for (const file of files) {
		const ext = file.path.slice(file.path.lastIndexOf('.')).toLowerCase();
		if (IMAGE_EXT.has(ext) && file.size > LARGE_IMAGE_BYTES) {
			add('warn', `${file.path} is ${(file.size / 1024 / 1024).toFixed(1)} MB. Compress it or swap to webp.`);
		} else if (ASSET_EXT.has(ext) && file.size > LARGE_ASSET_BYTES) {
			add('info', `${file.path} is ${Math.round(file.size / 1024)} KB and does not look minified.`);
		}
	}

	if (bytes > TOTAL_BUDGET_BYTES) {
		add('warn', `The site is ${(bytes / 1024 / 1024).toFixed(1)} MB in total.`);
	}

	const score = Math.max(
		5,
		100 - issues.reduce((total, issue) => total + PENALTY[issue.level], 0)
	);

	return { score, issues, bytes, files: files.length };
}

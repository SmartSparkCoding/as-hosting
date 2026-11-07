/**
 * Plain text helpers for the site search index.
 *
 * The index stores readable text, never markup: a page is stripped down to
 * words here so that searching can never return a snippet containing a
 * script tag or an attribute value.
 */

const ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	hellip: '…',
	mdash: '—',
	ndash: '–',
	rsquo: '’',
	lsquo: '‘',
	rdquo: '”',
	ldquo: '“',
};

export function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

export function decodeEntities(value: string): string {
	return value
		.replace(/&#(\d+);/g, (_, code: string) => {
			const point = Number(code);
			return Number.isFinite(point) && point > 0 && point <= 0x10ffff
				? String.fromCodePoint(point)
				: '';
		})
		.replace(/&#x([0-9a-f]+);/gi, (_, code: string) => {
			const point = Number.parseInt(code, 16);
			return Number.isFinite(point) && point > 0 && point <= 0x10ffff
				? String.fromCodePoint(point)
				: '';
		})
		.replace(/&([a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match);
}

/** True for files worth indexing: html and htm, but never editor or dotfiles. */
export function isIndexableFile(fileName: string): boolean {
	const lower = fileName.toLowerCase();
	if (lower.startsWith('.')) return false;
	return lower.endsWith('.html') || lower.endsWith('.htm');
}

/**
 * URL path for a file inside a release directory.
 * `index.html` becomes `/`, `about/index.html` becomes `/about/`.
 */
export function pagePathFromFile(relativePath: string): string {
	const cleaned = relativePath.replace(/\\/g, '/').replace(/^\.?\//, '');
	if (cleaned === '' || /(^|\/)index\.html?$/i.test(cleaned)) {
		const dir = cleaned.replace(/index\.html?$/i, '').replace(/\/+$/, '');
		return dir === '' ? '/' : `/${dir}/`;
	}
	return `/${cleaned}`;
}

/** Strips script, style, comments and tags, then collapses whitespace. */
export function htmlToText(html: string): string {
	return decodeEntities(
		html
			.replace(/<!--[\s\S]*?-->/g, ' ')
			.replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ')
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/(p|div|li|tr|h[1-6]|section|article|header|footer|blockquote)>/gi, '\n')
			.replace(/<[^>]*>/g, ' '),
	)
		.replace(/\s+/g, ' ')
		.replace(/\s+([.,;:!?)])/g, '$1')
		.trim();
}

export function extractTitle(html: string, fallback: string): string {
	const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
	const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
	const raw = title ?? heading;
	if (!raw) return fallback;
	const text = htmlToText(raw).trim();
	if (!text) return fallback;
	return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/** Trims a body to a length Postgres can hold comfortably, cutting on a word. */
export function truncateText(text: string, max: number): string {
	if (text.length <= max) return text;
	const cut = text.slice(0, max);
	const lastSpace = cut.lastIndexOf(' ');
	return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}...`;
}

/**
 * Rewrites a snippet from Postgres into safe HTML, turning the highlight
 * markers into `<mark>` and escaping everything else. Markers are applied
 * after escaping so a page can never inject markup of its own.
 */
export function renderSnippet(snippet: string, startSel = '[[H]]', stopSel = '[[/H]]'): string {
	const escaped = escapeHtml(snippet.replace(/\s+/g, ' ').trim());
	return escaped.split(startSel).join('<mark>').split(stopSel).join('</mark>');
}

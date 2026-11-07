import { PRODUCT_NAME } from '$lib/constants';

export interface SectionSite {
	name: string;
	slug: string;
}

export interface SectionPageOptions {
	groupName: string;
	description?: string | null;
	sites: SectionSite[];
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Index page for a section (a group of sites), served at `/<section>/`.
 *
 * Only PUBLIC, ACTIVE sites are listed: unlisted and password-protected sites
 * are reachable by their own URL but never advertised here.
 */
export function renderSectionPage(options: SectionPageOptions): string {
	const description = options.description
		? `<p class="lede">${escapeHtml(options.description)}</p>`
		: '';

	const cards = options.sites
		.map(
			(site) => `<a class="site" href="/${escapeHtml(site.slug)}/">
	<span class="name">${escapeHtml(site.name)}</span>
	<span class="slug">/${escapeHtml(site.slug)}/</span>
</a>`
		)
		.join('\n');

	const body =
		options.sites.length > 0
			? `<div class="sites">\n${cards}\n</div>`
			: `<p class="empty">Nothing here yet.</p>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(options.groupName)}</title>
<style>
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
	margin: 0;
	min-height: 100vh;
	padding: 56px 20px;
	background: #09090b;
	color: #e4e4e7;
	font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
}
main { max-width: 44rem; margin: 0 auto; }
.kicker {
	margin: 0 0 8px;
	font-size: 0.7rem;
	font-weight: 600;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: #34d399;
}
h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.02em; }
.lede { margin: 8px 0 0; color: #a1a1aa; font-size: 0.9rem; }
.count { margin: 24px 0 12px; font-size: 0.8rem; color: #71717a; }
.sites { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); }
.site {
	display: block;
	padding: 14px 16px;
	border: 1px solid #27272a;
	border-radius: 12px;
	background: #18181b;
	text-decoration: none;
	transition: border-color 120ms ease;
}
.site:hover { border-color: #3f3f46; }
.name { display: block; color: #f4f4f5; font-weight: 600; font-size: 0.95rem; }
.slug { display: block; margin-top: 2px; color: #71717a; font-size: 0.75rem; }
.empty {
	margin: 24px 0 0;
	padding: 28px;
	border: 1px dashed #27272a;
	border-radius: 12px;
	color: #71717a;
	text-align: center;
	font-size: 0.85rem;
}
.foot { margin: 40px 0 0; font-size: 0.7rem; color: #52525b; }
</style>
</head>
<body>
<main>
	<p class="kicker">Section</p>
	<h1>${escapeHtml(options.groupName)}</h1>
	${description}
	<p class="count">${options.sites.length} ${options.sites.length === 1 ? 'site' : 'sites'}</p>
	${body}
	<p class="foot">Hosted with ${escapeHtml(PRODUCT_NAME)}</p>
</main>
</body>
</html>`;
}

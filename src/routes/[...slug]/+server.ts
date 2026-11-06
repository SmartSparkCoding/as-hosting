import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getWebsiteBySlug } from '$lib/server/services/website.service';
import { recordAnalyticsEvent } from '$lib/server/services/analytics.service';
import { normalisePath, hasDownloadExtension, parseUtm } from '$lib/server/analytics/collect';
import { readCollectContext } from '$lib/server/analytics/request';
import { HostingStorage } from '$lib/server/hosting/storage';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const MIME_TYPES: Record<string, string> = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'application/javascript',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.ttf': 'font/ttf',
	'.otf': 'font/otf',
	'.webp': 'image/webp',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.txt': 'text/plain',
	'.xml': 'application/xml',
	'.pdf': 'application/pdf',
	'.zip': 'application/zip'
};

const ANALYTICS_SCRIPT_PATH = '/__as-hosting/analytics.js';

function getMimeType(filePath: string): string {
	const ext = '.' + filePath.split('.').pop()?.toLowerCase();
	return MIME_TYPES[ext] || 'application/octet-stream';
}

function isPathSafe(requestedPath: string): boolean {
	const normalized = normalize(requestedPath);
	return !normalized.startsWith('..') && !normalized.startsWith('/');
}

function escapeAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/**
 * The `<base>` href for a page served from a directory index. Relative asset
 * URLs must resolve against the directory the visitor is actually on, so
 * `/<slug>/blog/` keeps `style.css` pointed at `/<slug>/blog/style.css`.
 */
function directoryBaseHref(slug: string, sitePath: string): string {
	const suffix = sitePath === '/' ? '/' : `${sitePath}/`;
	return `/${slug}${suffix}`;
}

/**
 * Adds the `<base>` tag (when the page is served from a directory index) plus
 * the tiny analytics script. The script reports engagement/outbound clicks
 * only; pageviews are counted server-side so they still work with JS off.
 */
function prepareHtml(
	html: string,
	basePath: string | null,
	slug: string,
	sitePath: string
): string {
	let output = html;

	if (basePath) {
		const base = `<base href="${escapeAttribute(basePath)}">`;
		if (/<head[^>]*>/i.test(output)) {
			output = output.replace(/<head([^>]*)>/i, `<head$1>${base}`);
		} else {
			output = `${base}${output}`;
		}
	}

	const script =
		`<script defer src="${ANALYTICS_SCRIPT_PATH}" ` +
		`data-site="${escapeAttribute(slug)}" data-path="${escapeAttribute(sitePath)}"></script>`;

	if (/<\/body>/i.test(output)) {
		return output.replace(/<\/body>/i, `${script}</body>`);
	}

	return `${output}${script}`;
}

export const GET: RequestHandler = async ({ params, url, request, getClientAddress }) => {
	const rawSlug = params.slug;

	if (!rawSlug || !isPathSafe(rawSlug)) {
		throw error(404, 'Not found');
	}

	const slashIndex = rawSlug.indexOf('/');
	const slug = slashIndex === -1 ? rawSlug : rawSlug.slice(0, slashIndex);
	const subPath = slashIndex === -1 ? '' : rawSlug.slice(slashIndex + 1);

	if (!slug || !isPathSafe(slug)) {
		throw error(404, 'Not found');
	}

	const website = await getWebsiteBySlug(slug);
	if (!website) {
		throw error(404, 'Website not found');
	}

	if (website.status !== 'ACTIVE') {
		throw error(404, 'Website not available');
	}

	const sitePath = normalisePath(url.pathname.slice(slug.length + 1));
	const context = readCollectContext(request, getClientAddress);

	const capture = (type: 'pageview' | 'download' | 'not_found') => {
		void recordAnalyticsEvent({
			websiteId: website.id,
			type,
			path: sitePath,
			ctx: context,
			utm: type === 'pageview' ? parseUtm(url.searchParams) : null
		}).catch((err) => console.error('[analytics] Failed to record event:', err));
	};

	const storage = new HostingStorage();
	const basePath = storage.getServePath(website.id);

	// Strip trailing slashes from file path
	let filePath = subPath.replace(/\/+$/, '');
	if (!filePath || filePath === '') {
		filePath = 'index.html';
	}

	if (!isPathSafe(filePath)) {
		throw error(403, 'Forbidden');
	}

	const fullPath = join(basePath, filePath);

	const resolvedBase = normalize(basePath);
	const resolvedFull = normalize(fullPath);
	if (!resolvedFull.startsWith(resolvedBase)) {
		throw error(403, 'Forbidden');
	}

	try {
		const fileStat = await stat(fullPath);
		if (fileStat.isDirectory()) {
			const indexPath = join(fullPath, 'index.html');
			try {
				await stat(indexPath);
				const content = await readFile(indexPath, 'utf-8');
				capture('pageview');
				return new Response(
					prepareHtml(content, directoryBaseHref(slug, sitePath), slug, sitePath),
					{
						headers: {
							'Content-Type': 'text/html',
							'Cache-Control': 'public, max-age=300'
						}
					}
				);
			} catch {
				capture('not_found');
				throw error(404, 'Not found');
			}
		}

		const content = await readFile(fullPath);
		const mimeType = getMimeType(fullPath);

		if (mimeType === 'text/html') {
			const html = content.toString('utf-8');
			capture('pageview');
			return new Response(
				prepareHtml(html, subPath ? null : `/${slug}/`, slug, sitePath),
				{
					headers: {
						'Content-Type': mimeType,
						'Cache-Control': 'public, max-age=60'
					}
				}
			);
		}

		if (hasDownloadExtension(fullPath)) {
			capture('download');
		}

		return new Response(content, {
			headers: {
				'Content-Type': mimeType,
				'Cache-Control': mimeType.startsWith('text/') ? 'public, max-age=60' : 'public, max-age=86400'
			}
		});
	} catch (e: any) {
		if (e?.status === 404) throw e;
		capture('not_found');
		throw error(404, 'Not found');
	}
};

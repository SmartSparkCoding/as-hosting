import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';

/**
 * Deploy screenshots.
 *
 * After a successful publish we serve the released files from a throwaway
 * localhost server and let Playwright take one 1200x630 shot. Doing it against
 * the files (not the public URL) means it works before the site is flipped to
 * ACTIVE, and it never depends on PUBLIC_BASE_URL being reachable from the box.
 *
 * Playwright is a dev dependency, so this is best effort: if the package or a
 * Chromium build is missing, `captureThumbnail` returns false and the deploy
 * carries on.
 */

const MIME: Record<string, string> = {
	'.html': 'text/html; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.webp': 'image/webp',
	'.avif': 'image/avif',
	'.ico': 'image/x-icon',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain; charset=utf-8'
};

async function startStaticServer(root: string): Promise<{ server: Server; port: number }> {
	const server = createServer(async (req, res) => {
		try {
			const url = new URL(req.url ?? '/', 'http://127.0.0.1');
			const requested = decodeURIComponent(url.pathname);
			const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
			let filePath = join(root, safePath);

			if (!filePath.startsWith(root + sep) && filePath !== root) {
				res.writeHead(403).end('Forbidden');
				return;
			}

			let info = await stat(filePath).catch(() => null);
			if (info?.isDirectory()) {
				filePath = join(filePath, 'index.html');
				info = await stat(filePath).catch(() => null);
			}

			if (!info?.isFile()) {
				res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
				return;
			}

			const body = await readFile(filePath);
			res.writeHead(200, {
				'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
				'Content-Length': body.byteLength
			});
			res.end(body);
		} catch {
			res.writeHead(500, { 'Content-Type': 'text/plain' }).end('Error');
		}
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => resolve());
	});

	const address = server.address();
	const port = typeof address === 'object' && address ? address.port : 0;
	return { server, port };
}

export async function captureThumbnail(sourceDir: string, outPath: string): Promise<boolean> {
	if (process.env.THUMBNAILS_ENABLED === 'false') return false;

	type ChromiumLauncher = { launch: (options?: Record<string, unknown>) => Promise<unknown> };
	let chromium: ChromiumLauncher | null = null;
	try {
		const require = createRequire(import.meta.url);
		let playwright: Record<string, unknown>;
		try {
			playwright = require('playwright');
		} catch {
			playwright = require('@playwright/test');
		}
		chromium = playwright.chromium as ChromiumLauncher;
	} catch {
		return false;
	}

	if (!chromium) return false;

	let server: Server | null = null;
	let browser: { close: () => Promise<void> } | null = null;

	try {
		const started = await startStaticServer(sourceDir);
		server = started.server;

		const instance = (await chromium.launch({ args: ['--no-sandbox'] })) as {
			newPage: (options?: Record<string, unknown>) => Promise<{
				goto: (url: string, options?: Record<string, unknown>) => Promise<unknown>;
				screenshot: (options?: Record<string, unknown>) => Promise<Buffer>;
			}>;
			close: () => Promise<void>;
		};
		browser = instance;

		const page = await instance.newPage({ viewport: { width: 1200, height: 630 } });
		await page.goto(`http://127.0.0.1:${started.port}/`, {
			waitUntil: 'load',
			timeout: 15000
		});

		const shot = await page.screenshot({ type: 'png' });
		await mkdir(join(outPath, '..'), { recursive: true });
		const { writeFile } = await import('node:fs/promises');
		await writeFile(outPath, shot);
		return true;
	} catch (err) {
		console.error('[thumbnail] capture failed:', err instanceof Error ? err.message : err);
		return false;
	} finally {
		await browser?.close().catch(() => {});
		if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
	}
}

import { error } from '@sveltejs/kit';
import { stat, readFile } from 'node:fs/promises';
import type { RequestHandler } from './$types';
import { getWebsiteById } from '$lib/server/services/website.service';
import { HostingStorage } from '$lib/server/hosting/storage';
import { getPermissions, Permission } from '$lib/permissions';

// Deploy screenshot for a site. Kept behind the normal site permission so an
// unlisted or password protected site never leaks a picture of itself.
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		throw error(401, 'Sign in to view this screenshot');
	}

	const website = await getWebsiteById(params.id);
	if (!website) {
		throw error(404, 'Website not found');
	}

	const permissions = getPermissions(locals.user.role, locals.user.ambassadorPermission);
	if (!permissions.includes(Permission.VIEW_WEBSITE)) {
		throw error(403, 'You do not have access to this website');
	}

	const path = new HostingStorage().getThumbnailPath(website.id);
	let info;
	try {
		info = await stat(path);
	} catch {
		throw error(404, 'No screenshot yet');
	}

	const file = await readFile(path);
	const etag = `W/"thumb-${info.mtimeMs}"`;

	return new Response(new Uint8Array(file), {
		headers: {
			'Content-Type': 'image/png',
			'Content-Length': String(file.byteLength),
			'Cache-Control': 'private, max-age=60, must-revalidate',
			ETag: etag
		}
	});
};

import type { CollectContext } from './collect';

/**
 * Turns a SvelteKit request into the small set of fields the collector may see.
 * Nothing here is persisted: it is used for filtering and for the daily-salted
 * visitor hash, then thrown away.
 */
export function readCollectContext(
	request: Request,
	getClientAddress: () => string
): CollectContext {
	const headers = request.headers;

	const purposeHeader = `${headers.get('sec-purpose') ?? ''} ${headers.get('purpose') ?? ''} ${headers.get('x-purpose') ?? ''} ${headers.get('x-moz') ?? ''}`;
	const prefetch = /prefetch|prerender|preview/i.test(purposeHeader);

	return {
		ip: readIp(request, getClientAddress),
		userAgent: headers.get('user-agent'),
		referer: headers.get('referer'),
		host: headers.get('host'),
		country: headers.get('cf-ipcountry'),
		language: headers.get('accept-language'),
		dnt: headers.get('dnt') === '1',
		gpc: headers.get('sec-gpc') === '1',
		secFetchDest: headers.get('sec-fetch-dest'),
		prefetch
	};
}

function readIp(request: Request, getClientAddress: () => string): string | null {
	const headers = request.headers;
	const candidates = [
		headers.get('cf-connecting-ip'),
		headers.get('x-forwarded-for')?.split(',')[0],
		headers.get('x-real-ip')
	];

	for (const candidate of candidates) {
		const ip = candidate?.trim();
		if (ip) return ip.slice(0, 64);
	}

	try {
		return getClientAddress() || null;
	} catch {
		return null;
	}
}

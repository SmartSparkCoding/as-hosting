import { createHash, randomBytes } from 'node:crypto';

/**
 * Everything the collector is allowed to look at.
 *
 * This is deliberately a small, explicit surface: no cookies, no query strings,
 * no full URLs, no raw headers. If a field is not here it is not collected.
 */
export interface CollectContext {
	ip: string | null;
	userAgent: string | null;
	referer: string | null;
	host: string | null;
	country: string | null;
	language: string | null;
	dnt: boolean;
	gpc: boolean;
	secFetchDest: string | null;
	prefetch: boolean;
}

export const BOT_USER_AGENT =
	/(?:bot|crawler|spider|slurp|archiver|scraper|preview|monitor|uptime|pingdom|statuscake|lighthouse|pagespeed|headless|selenium|playwright|puppeteer|phantomjs|curl\/|wget\/|python-requests|python-urllib|go-http-client|node-fetch|axios\/|okhttp|libwww|httpclient|java\/|facebookexternalhit|embedly|quora link preview|whatsapp\/|telegrambot|slackbot|discordbot|linkedinbot|pinterestbot|applebot|bingpreview|google-inspectiontool|yandexbot)/i;

export const SEARCH_HOSTS = [
	'google',
	'bing',
	'duckduckgo',
	'yahoo',
	'ecosia',
	'search.brave',
	'brave',
	'startpage',
	'qwant',
	'yandex',
	'baidu',
	'sogou',
	'naver',
	'aol'
];

export const SOCIAL_HOSTS = [
	'facebook',
	'fb.com',
	'instagram',
	'linkedin',
	'reddit',
	't.co',
	'twitter',
	'x.com',
	'discord',
	'tiktok',
	'snapchat',
	'youtube',
	'youtu.be',
	'whatsapp',
	'telegram',
	'pinterest',
	'threads',
	'mastodon',
	'tumblr',
	'twitch'
];

export const DOWNLOAD_EXTENSIONS = [
	'pdf',
	'zip',
	'dmg',
	'exe',
	'msi',
	'apk',
	'csv',
	'doc',
	'docx',
	'xls',
	'xlsx',
	'ppt',
	'pptx',
	'epub'
];

const MAX_PATH_LENGTH = 512;
const MAX_HOST_LENGTH = 255;
const MAX_TEXT_LENGTH = 64;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
	if (!userAgent) return true;
	if (userAgent.trim().length < 10) return true;
	return BOT_USER_AGENT.test(userAgent);
}

/**
 * Returns why a request must not be counted, or null when it is fine.
 * Order matters: opt-outs win over everything.
 */
export function getCollectionBlockReason(ctx: CollectContext): string | null {
	if (ctx.dnt || ctx.gpc) return 'opt-out';
	if (!ctx.userAgent) return 'no-user-agent';
	if (isBotUserAgent(ctx.userAgent)) return 'bot';
	if (ctx.prefetch) return 'prefetch';
	if (ctx.secFetchDest && ctx.secFetchDest !== 'document' && ctx.secFetchDest !== 'iframe') {
		return 'not-a-document';
	}
	return null;
}

export function shouldCollect(ctx: CollectContext): boolean {
	return getCollectionBlockReason(ctx) === null;
}

function detectBrowser(ua: string): { browser: string; browserVersion: string } {
	const match = (pattern: RegExp, name: string) => {
		const found = ua.match(pattern);
		if (!found) return null;
		return { browser: name, browserVersion: found[1].split('.')[0].slice(0, 16) };
	};

	// Order matters: Chromium forks all pretend to be Chrome and Safari.
	const edge = match(/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Edge');
	if (edge) return edge;

	const opera = match(/(?:OPR|Opera)\/([\d.]+)/, 'Opera');
	if (opera) return opera;

	const samsung = match(/SamsungBrowser\/([\d.]+)/, 'Samsung Internet');
	if (samsung) return samsung;

	const firefox = match(/(?:Firefox|FxiOS)\/([\d.]+)/, 'Firefox');
	if (firefox) return firefox;

	const chrome = match(/(?:Chrome|CriOS|Chromium)\/([\d.]+)/, 'Chrome');
	if (chrome) return chrome;

	const safari = match(/Version\/([\d.]+).*Safari\//, 'Safari');
	if (safari) return safari;

	const ie = match(/(?:MSIE |rv:)([\d.]+).*Trident\//, 'Internet Explorer');
	if (ie) return ie;

	return { browser: 'Other', browserVersion: '' };
}

function detectOs(ua: string): string {
	if (/Windows NT 10\.0/.test(ua)) return 'Windows';
	if (/Windows NT 6\.[123]/.test(ua)) return 'Windows';
	if (/Windows/.test(ua)) return 'Windows';
	if (/Android/.test(ua)) return 'Android';
	if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
	if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
	if (/CrOS/.test(ua)) return 'ChromeOS';
	if (/Linux/.test(ua)) return 'Linux';
	return 'Other';
}

function detectDevice(ua: string): 'desktop' | 'mobile' | 'tablet' {
	if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
	if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
	if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
	return 'desktop';
}

export interface UserAgentInfo {
	browser: string;
	browserVersion: string;
	os: string;
	device: 'desktop' | 'mobile' | 'tablet';
}

export function parseUserAgent(userAgent: string | null | undefined): UserAgentInfo {
	if (!userAgent) {
		return { browser: 'Other', browserVersion: '', os: 'Other', device: 'desktop' };
	}

	const { browser, browserVersion } = detectBrowser(userAgent);
	return {
		browser,
		browserVersion,
		os: detectOs(userAgent),
		device: detectDevice(userAgent)
	};
}

export function cleanHost(host: string | null | undefined): string | null {
	if (!host) return null;
	const trimmed = host.trim().toLowerCase();
	// Only keep the authority part if somebody passed a whole URL or a path.
	const authority = trimmed.split(/[/?#]/)[0];
	const cleaned = authority.replace(/^www\./, '').replace(/[^a-z0-9.:-]/g, '').slice(0, MAX_HOST_LENGTH);
	return cleaned || null;
}

function hostMatches(host: string, candidates: string[]): boolean {
	const labels = host.split('.');
	return candidates.some(
		(candidate) =>
			host === candidate ||
			host.endsWith(`.${candidate}`) ||
			host.startsWith(`${candidate}.`) ||
			labels.includes(candidate)
	);
}

export interface ReferrerInfo {
	referrerHost: string | null;
	referrerType: 'direct' | 'internal' | 'search' | 'social' | 'referral';
}

export function classifyReferrer(
	referrer: string | null | undefined,
	ownHost: string | null | undefined
): ReferrerInfo {
	if (!referrer) return { referrerHost: null, referrerType: 'direct' };

	let parsed: URL;
	try {
		parsed = new URL(referrer);
	} catch {
		return { referrerHost: null, referrerType: 'direct' };
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return { referrerHost: null, referrerType: 'direct' };
	}

	const referrerHost = cleanHost(parsed.hostname);
	if (!referrerHost) return { referrerHost: null, referrerType: 'direct' };

	const self = cleanHost(ownHost)?.split(':')[0] ?? null;
	if (self && referrerHost === self) {
		return { referrerHost, referrerType: 'internal' };
	}

	if (hostMatches(referrerHost, SEARCH_HOSTS)) {
		return { referrerHost, referrerType: 'search' };
	}

	if (hostMatches(referrerHost, SOCIAL_HOSTS)) {
		return { referrerHost, referrerType: 'social' };
	}

	return { referrerHost, referrerType: 'referral' };
}

/**
 * Normalises a request path into the shape shown in the dashboard.
 * Everything after `?` and `#` is dropped, `index.html` collapses to its
 * directory, duplicate slashes are collapsed and the length is capped.
 */
export function normalisePath(rawPath: string | null | undefined): string {
	if (!rawPath) return '/';

	let path = rawPath.split('#')[0].split('?')[0].trim();
	if (!path) return '/';

	if (!path.startsWith('/')) path = `/${path}`;
	path = path.replace(/\/{2,}/g, '/');
	path = path.replace(/\/index\.html?$/i, '/');

	if (path.length > 1) path = path.replace(/\/+$/, '');
	if (path.length > MAX_PATH_LENGTH) path = path.slice(0, MAX_PATH_LENGTH);

	return path || '/';
}

/** Builds the report path for a file served from a site's directory. */
export function pathFromFile(subPath: string, isIndexFile = false): string {
	if (!subPath) return '/';
	const suffix = isIndexFile ? '/index.html' : '';
	return normalisePath(`/${subPath}${suffix}`);
}

export function parseAcceptLanguage(header: string | null | undefined): string | null {
	if (!header) return null;
	const first = header.split(',')[0]?.split(';')[0]?.trim();
	if (!first) return null;
	if (!/^[a-zA-Z]{1,8}(?:-[a-zA-Z0-9]{1,8})*$/.test(first)) return null;
	return first.slice(0, 35);
}

export function normaliseCountry(value: string | null | undefined): string | null {
	if (!value) return null;
	const country = value.trim().toUpperCase();
	if (!/^[A-Z]{2}$/.test(country)) return null;
	if (['XX', 'T1', 'A1', 'A2'].includes(country)) return null;
	return country;
}

export function parseUtm(searchParams: URLSearchParams): {
	utmSource: string | null;
	utmMedium: string | null;
	utmCampaign: string | null;
} {
	const clean = (value: string | null) => {
		if (!value) return null;
		const trimmed = value.trim().replace(/[^\w .:-]/g, '').slice(0, MAX_TEXT_LENGTH);
		return trimmed || null;
	};

	return {
		utmSource: clean(searchParams.get('utm_source')),
		utmMedium: clean(searchParams.get('utm_medium')),
		utmCampaign: clean(searchParams.get('utm_campaign'))
	};
}

export function clampInteger(
	value: unknown,
	min: number,
	max: number
): number | null {
	if (value === null || value === undefined || value === '') return null;
	const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
	if (!Number.isFinite(parsed)) return null;
	return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function hasDownloadExtension(path: string): boolean {
	const extension = path.split('?')[0].split('.').pop()?.toLowerCase();
	if (!extension) return false;
	return DOWNLOAD_EXTENSIONS.includes(extension);
}

/* -------------------------------------------------------------------------- */
/* Visitor hashing                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The salt is generated once per process and rotated at (UTC) midnight.
 * It is never written anywhere, so yesterday's hashes cannot be recomputed
 * even by someone holding the database.
 */
let currentSalt = randomBytes(32).toString('hex');
let currentSaltDay = utcDayKey();

function utcDayKey(date: Date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

function getSalt(date: Date = new Date()): string {
	const day = utcDayKey(date);
	if (day !== currentSaltDay) {
		currentSalt = randomBytes(32).toString('hex');
		currentSaltDay = day;
	}
	return currentSalt;
}

export function hashVisitor(
	ip: string | null | undefined,
	userAgent: string | null | undefined,
	date: Date = new Date()
): string {
	return hashVisitorWithSalt(ip, userAgent, getSalt(date));
}

export function hashVisitorWithSalt(
	ip: string | null | undefined,
	userAgent: string | null | undefined,
	salt: string
): string {
	return createHash('sha256')
		.update(salt)
		.update('|')
		.update(ip ?? '')
		.update('|')
		.update(userAgent ?? '')
		.digest('hex')
		.slice(0, 16);
}

/** Test helper. Never call this from production code. */
export function __resetAnalyticsSaltForTests(salt = 'test-salt', day = utcDayKey()): void {
	currentSalt = salt;
	currentSaltDay = day;
}

/** Test helper: force a rotation without waiting for midnight. */
export function __rotateAnalyticsSaltForTests(salt = 'next-salt', day = '2999-01-01'): void {
	currentSalt = salt;
	currentSaltDay = day;
}

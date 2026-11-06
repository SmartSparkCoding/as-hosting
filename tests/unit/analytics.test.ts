import { describe, it, expect, beforeEach } from 'vitest';
import {
	__resetAnalyticsSaltForTests,
	__rotateAnalyticsSaltForTests,
	classifyReferrer,
	cleanHost,
	clampInteger,
	getCollectionBlockReason,
	hasDownloadExtension,
	hashVisitor,
	hashVisitorWithSalt,
	isBotUserAgent,
	normaliseCountry,
	normalisePath,
	parseAcceptLanguage,
	parseUserAgent,
	parseUtm,
	pathFromFile,
	shouldCollect,
	type CollectContext
} from '$lib/server/analytics/collect';
import {
	channelLabel,
	countryName,
	deviceLabel,
	formatCompact,
	formatDuration,
	formatNumber,
	languageName,
	parseAnalyticsRange
} from '$lib/analytics';

const CHROME_MAC =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IOS =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const EDGE_WINDOWS =
	'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
const FIREFOX_LINUX =
	'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0';
const SAMSUNG_ANDROID =
	'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36';
const IPAD =
	'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_TABLET =
	'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function context(overrides: Partial<CollectContext> = {}): CollectContext {
	return {
		ip: '203.0.113.10',
		userAgent: CHROME_MAC,
		referer: null,
		host: 'example.as-hosting.dev',
		country: 'GB',
		language: 'en-GB,en;q=0.9',
		dnt: false,
		gpc: false,
		secFetchDest: 'document',
		prefetch: false,
		...overrides
	};
}

describe('bot filtering', () => {
	it('flags known crawlers, CLI tools and short agent strings', () => {
		expect(isBotUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(
			true
		);
		expect(isBotUserAgent('curl/8.7.1')).toBe(true);
		expect(isBotUserAgent('node-fetch/1.0')).toBe(true);
		expect(isBotUserAgent('Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)')).toBe(true);
		expect(isBotUserAgent('Mozilla/5.0 HeadlessChrome/126.0.0.0')).toBe(true);
		expect(isBotUserAgent('short')).toBe(true);
		expect(isBotUserAgent(null)).toBe(true);
	});

	it('allows real browser agents', () => {
		expect(isBotUserAgent(CHROME_MAC)).toBe(false);
		expect(isBotUserAgent(SAFARI_IOS)).toBe(false);
		expect(isBotUserAgent(FIREFOX_LINUX)).toBe(false);
	});
});

describe('getCollectionBlockReason', () => {
	it('allows a normal document request', () => {
		expect(getCollectionBlockReason(context())).toBeNull();
		expect(shouldCollect(context())).toBe(true);
	});

	it('honours Do Not Track and Global Privacy Control before anything else', () => {
		expect(getCollectionBlockReason(context({ dnt: true }))).toBe('opt-out');
		expect(getCollectionBlockReason(context({ gpc: true }))).toBe('opt-out');
		// opt-outs win even over a bot user agent
		expect(getCollectionBlockReason(context({ dnt: true, userAgent: 'Googlebot/2.1' }))).toBe('opt-out');
	});

	it('ignores requests with no user agent', () => {
		expect(getCollectionBlockReason(context({ userAgent: null }))).toBe('no-user-agent');
		expect(getCollectionBlockReason(context({ userAgent: 'Googlebot/2.1' }))).toBe('bot');
	});

	it('ignores prefetches and non-document fetches', () => {
		expect(getCollectionBlockReason(context({ prefetch: true }))).toBe('prefetch');
		expect(getCollectionBlockReason(context({ secFetchDest: 'image' }))).toBe('not-a-document');
		expect(getCollectionBlockReason(context({ secFetchDest: 'empty' }))).toBe('not-a-document');
		expect(getCollectionBlockReason(context({ secFetchDest: 'iframe' }))).toBeNull();
		expect(getCollectionBlockReason(context({ secFetchDest: null }))).toBeNull();
	});
});

describe('parseUserAgent', () => {
	it('detects Chrome on macOS as desktop', () => {
		expect(parseUserAgent(CHROME_MAC)).toEqual({
			browser: 'Chrome',
			browserVersion: '126',
			os: 'macOS',
			device: 'desktop'
		});
	});

	it('detects Safari on iOS as mobile', () => {
		expect(parseUserAgent(SAFARI_IOS)).toEqual({
			browser: 'Safari',
			browserVersion: '17',
			os: 'iOS',
			device: 'mobile'
		});
	});

	it('recognises Chromium forks that also claim to be Chrome', () => {
		expect(parseUserAgent(EDGE_WINDOWS)).toMatchObject({
			browser: 'Edge',
			browserVersion: '126',
			os: 'Windows',
			device: 'desktop'
		});
		expect(parseUserAgent(SAMSUNG_ANDROID)).toMatchObject({
			browser: 'Samsung Internet',
			browserVersion: '25',
			os: 'Android',
			device: 'mobile'
		});
	});

	it('detects Firefox on Linux', () => {
		expect(parseUserAgent(FIREFOX_LINUX)).toMatchObject({
			browser: 'Firefox',
			browserVersion: '127',
			os: 'Linux',
			device: 'desktop'
		});
	});

	it('detects tablets', () => {
		expect(parseUserAgent(IPAD).device).toBe('tablet');
		expect(parseUserAgent(IPAD).os).toBe('iOS');
		expect(parseUserAgent(ANDROID_TABLET)).toMatchObject({
			os: 'Android',
			device: 'tablet'
		});
	});

	it('falls back safely for missing agents', () => {
		expect(parseUserAgent(null)).toEqual({
			browser: 'Other',
			browserVersion: '',
			os: 'Other',
			device: 'desktop'
		});
	});
});

describe('cleanHost', () => {
	it('lowercases, strips www and drops anything not host-like', () => {
		expect(cleanHost('WWW.Example.COM')).toBe('example.com');
		expect(cleanHost('  news.ycombinator.com/path?x=1  ')).toBe('news.ycombinator.com');
		expect(cleanHost(null)).toBeNull();
		expect(cleanHost('   ')).toBeNull();
	});
});

describe('classifyReferrer', () => {
	it('treats a missing or unusable referrer as direct', () => {
		expect(classifyReferrer(null, 'example.com')).toEqual({
			referrerHost: null,
			referrerType: 'direct'
		});
		expect(classifyReferrer('not a url', 'example.com')).toEqual({
			referrerHost: null,
			referrerType: 'direct'
		});
		expect(classifyReferrer('ftp://example.com/file', 'example.com')).toEqual({
			referrerHost: null,
			referrerType: 'direct'
		});
	});

	it('stores only the hostname, never the full referring URL', () => {
		const result = classifyReferrer('https://www.google.com/search?q=private+search', 'mysite.com');
		expect(result).toEqual({ referrerHost: 'google.com', referrerType: 'search' });
		expect(JSON.stringify(result)).not.toContain('private');
	});

	it('classifies internal, search, social and referral traffic', () => {
		expect(classifyReferrer('https://mysite.com/other', 'mysite.com')).toEqual({
			referrerHost: 'mysite.com',
			referrerType: 'internal'
		});
		expect(classifyReferrer('https://duckduckgo.com/?q=club', 'mysite.com').referrerType).toBe('search');
		expect(classifyReferrer('https://search.brave.com/search?q=club', 'mysite.com').referrerType).toBe(
			'search'
		);
		expect(classifyReferrer('https://t.co/abc', 'mysite.com').referrerType).toBe('social');
		expect(classifyReferrer('https://www.reddit.com/r/hackclub', 'mysite.com').referrerType).toBe(
			'social'
		);
		expect(classifyReferrer('https://hackclub.com/', 'mysite.com').referrerType).toBe('referral');
	});

	it('ignores the port when comparing to the site host', () => {
		expect(classifyReferrer('https://myhost.dev/x', 'myhost.dev:5173').referrerType).toBe('internal');
	});

	it('does not treat a lookalike host as a search engine', () => {
		expect(classifyReferrer('https://notgoogle.com/x', 'mysite.com').referrerType).toBe('referral');
	});
});

describe('normalisePath', () => {
	it('drops query strings and fragments', () => {
		expect(normalisePath('/about?utm_source=x#team')).toBe('/about');
		expect(normalisePath('/?q=1')).toBe('/');
	});

	it('adds a leading slash and collapses duplicate slashes', () => {
		expect(normalisePath('about')).toBe('/about');
		expect(normalisePath('//about///team')).toBe('/about/team');
	});

	it('collapses index.html to its directory', () => {
		expect(normalisePath('/index.html')).toBe('/');
		expect(normalisePath('/about/index.html')).toBe('/about');
		expect(normalisePath('/about/index.htm')).toBe('/about');
	});

	it('strips trailing slashes but keeps the root', () => {
		expect(normalisePath('/about/')).toBe('/about');
		expect(normalisePath('/')).toBe('/');
		expect(normalisePath('')).toBe('/');
		expect(normalisePath(null)).toBe('/');
	});

	it('caps very long paths', () => {
		const long = `/${'a'.repeat(900)}`;
		expect(normalisePath(long).length).toBe(512);
	});
});

describe('pathFromFile', () => {
	it('maps files and directory indexes onto report paths', () => {
		expect(pathFromFile('')).toBe('/');
		expect(pathFromFile('about')).toBe('/about');
		expect(pathFromFile('blog/post.html')).toBe('/blog/post.html');
		expect(pathFromFile('about', true)).toBe('/about');
	});
});

describe('parseAcceptLanguage', () => {
	it('keeps the first language tag and drops quality values', () => {
		expect(parseAcceptLanguage('en-GB,en;q=0.9')).toBe('en-GB');
		expect(parseAcceptLanguage('fr')).toBe('fr');
		expect(parseAcceptLanguage('pt-BR,pt;q=0.8')).toBe('pt-BR');
	});

	it('rejects junk and missing headers', () => {
		expect(parseAcceptLanguage(null)).toBeNull();
		expect(parseAcceptLanguage('')).toBeNull();
		expect(parseAcceptLanguage('<script>')).toBeNull();
	});
});

describe('normaliseCountry', () => {
	it('accepts two-letter ISO codes in any case', () => {
		expect(normaliseCountry('gb')).toBe('GB');
		expect(normaliseCountry('US')).toBe('US');
	});

	it('rejects unknown placeholders and junk', () => {
		expect(normaliseCountry('XX')).toBeNull();
		expect(normaliseCountry('T1')).toBeNull();
		expect(normaliseCountry('GBR')).toBeNull();
		expect(normaliseCountry(null)).toBeNull();
	});
});

describe('parseUtm', () => {
	it('reads campaign tags', () => {
		const params = new URLSearchParams(
			'utm_source=Slack&utm_medium=social&utm_campaign=Autumn Launch'
		);
		expect(parseUtm(params)).toEqual({
			utmSource: 'Slack',
			utmMedium: 'social',
			utmCampaign: 'Autumn Launch'
		});
	});

	it('returns nulls when absent and strips unsafe characters', () => {
		expect(parseUtm(new URLSearchParams(''))).toEqual({
			utmSource: null,
			utmMedium: null,
			utmCampaign: null
		});
		expect(parseUtm(new URLSearchParams('utm_source=%3Cscript%3Ealert(1)%3C%2Fscript%3E')).utmSource).toBe(
			'scriptalert1script'
		);
	});
});

describe('clampInteger', () => {
	it('clamps into range and rounds', () => {
		expect(clampInteger(12.6, 0, 100)).toBe(13);
		expect(clampInteger(-5, 0, 100)).toBe(0);
		expect(clampInteger(500, 0, 100)).toBe(100);
		expect(clampInteger('42', 0, 100)).toBe(42);
	});

	it('returns null for missing or non-numeric values', () => {
		expect(clampInteger(null, 0, 10)).toBeNull();
		expect(clampInteger(undefined, 0, 10)).toBeNull();
		expect(clampInteger('', 0, 10)).toBeNull();
		expect(clampInteger('abc', 0, 10)).toBeNull();
		expect(clampInteger(Number.POSITIVE_INFINITY, 0, 10)).toBeNull();
	});
});

describe('hasDownloadExtension', () => {
	it('detects common download types', () => {
		expect(hasDownloadExtension('/files/report.pdf')).toBe(true);
		expect(hasDownloadExtension('/release/bundle.zip')).toBe(true);
		expect(hasDownloadExtension('/files/report.PDF')).toBe(true);
		expect(hasDownloadExtension('/files/report.pdf?x=1')).toBe(true);
	});

	it('ignores pages, images and files without an extension', () => {
		expect(hasDownloadExtension('/about')).toBe(false);
		expect(hasDownloadExtension('/style.css')).toBe(false);
		expect(hasDownloadExtension('/logo.png')).toBe(false);
	});
});

describe('visitor hashing', () => {
	beforeEach(() => {
		__resetAnalyticsSaltForTests('unit-test-salt', '2026-01-01');
	});

	it('produces a stable, truncated, salted hash', () => {
		const first = hashVisitor('203.0.113.10', CHROME_MAC);
		const second = hashVisitor('203.0.113.10', CHROME_MAC);

		expect(first).toBe(second);
		expect(first).toHaveLength(16);
		expect(first).toMatch(/^[0-9a-f]{16}$/);
		expect(first).not.toContain('203.0.113.10');
	});

	it('cannot be reproduced without the salt', () => {
		const withSalt = hashVisitorWithSalt('203.0.113.10', CHROME_MAC, 'salt-a');
		const otherSalt = hashVisitorWithSalt('203.0.113.10', CHROME_MAC, 'salt-b');

		expect(withSalt).not.toBe(otherSalt);
		expect(withSalt).toHaveLength(16);
	});

	it('changes when the daily salt rotates', () => {
		const beforeRotation = hashVisitor('203.0.113.10', CHROME_MAC);
		__rotateAnalyticsSaltForTests('unit-test-salt-next', '2026-01-02');
		const afterRotation = hashVisitor('203.0.113.10', CHROME_MAC);

		expect(afterRotation).not.toBe(beforeRotation);
	});

	it('separates different visitors', () => {
		expect(hashVisitor('203.0.113.10', CHROME_MAC)).not.toBe(
			hashVisitor('203.0.113.11', CHROME_MAC)
		);
		expect(hashVisitor('203.0.113.10', CHROME_MAC)).not.toBe(
			hashVisitor('203.0.113.10', SAFARI_IOS)
		);
	});
});

describe('analytics display helpers', () => {
	it('parses the range query parameter', () => {
		expect(parseAnalyticsRange('7')).toBe(7);
		expect(parseAnalyticsRange('30')).toBe(30);
		expect(parseAnalyticsRange('90')).toBe(90);
		expect(parseAnalyticsRange('365')).toBe(30);
		expect(parseAnalyticsRange('abc')).toBe(30);
		expect(parseAnalyticsRange(null)).toBe(30);
	});

	it('formats numbers compactly', () => {
		expect(formatNumber(1234)).toBe('1,234');
		expect(formatCompact(0)).toBe('0');
		expect(formatCompact(999)).toBe('999');
		expect(formatCompact(1500)).toBe('1.5k');
		expect(formatCompact(2000)).toBe('2k');
		expect(formatCompact(2_400_000)).toBe('2.4m');
	});

	it('formats durations', () => {
		expect(formatDuration(0)).toBe('0s');
		expect(formatDuration(null)).toBe('0s');
		expect(formatDuration(45)).toBe('45s');
		expect(formatDuration(60)).toBe('1m');
		expect(formatDuration(95)).toBe('1m 35s');
		expect(formatDuration(3600)).toBe('1h');
		expect(formatDuration(3900)).toBe('1h 5m');
	});

	it('labels channels, devices, countries and languages', () => {
		expect(channelLabel('search')).toBe('Search engines');
		expect(channelLabel('something-else')).toBe('something-else');
		expect(deviceLabel('mobile')).toBe('Mobile');
		expect(countryName('GB')).toBe('United Kingdom (GB)');
		expect(languageName('en-GB')).toBe('British English (en-GB)');
	});
});

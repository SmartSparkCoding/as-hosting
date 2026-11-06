export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export function parseAnalyticsRange(value: string | null | undefined): AnalyticsRange {
	const parsed = Number(value);
	for (const range of ANALYTICS_RANGES) {
		if (parsed === range) return range;
	}
	return 30;
}

export function formatNumber(value: number): string {
	return Math.round(value).toLocaleString('en-GB');
}

export function formatCompact(value: number): string {
	if (value < 1000) return String(Math.round(value));
	if (value < 10_000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
	if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
	return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`;
}

export function formatDuration(seconds: number | null | undefined): string {
	if (!seconds || seconds < 1) return '0s';
	const minutes = Math.floor(seconds / 60);
	const remainder = Math.round(seconds % 60);

	if (minutes === 0) return `${remainder}s`;
	if (minutes < 60) return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;

	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
}

export const CHANNEL_LABELS: Record<string, string> = {
	direct: 'Direct',
	search: 'Search engines',
	social: 'Social media',
	referral: 'Referrals',
	internal: 'Internal navigation'
};

export function channelLabel(value: string): string {
	return CHANNEL_LABELS[value] ?? value;
}

export const DEVICE_LABELS: Record<string, string> = {
	desktop: 'Desktop',
	mobile: 'Mobile',
	tablet: 'Tablet'
};

export function deviceLabel(value: string): string {
	return DEVICE_LABELS[value] ?? value;
}

export function countryName(code: string): string {
	try {
		const name = new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(code);
		return name ? `${name} (${code})` : code;
	} catch {
		return code;
	}
}

export function languageName(code: string): string {
	try {
		const name = new Intl.DisplayNames(['en-GB'], { type: 'language' }).of(code);
		return name ? `${name} (${code})` : code;
	} catch {
		return code;
	}
}

<script lang="ts">
	import TrendChart from '$lib/components/analytics/TrendChart.svelte';
	import BarList from '$lib/components/analytics/BarList.svelte';
	import Heatmap from '$lib/components/analytics/Heatmap.svelte';
	import StatCard from '$lib/components/analytics/StatCard.svelte';
	import {
		channelLabel,
		countryName,
		deviceLabel,
		formatDuration,
		formatNumber,
		languageName
	} from '$lib/analytics';
	import { PRODUCT_NAME } from '$lib/constants';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type LiveSnapshot = {
		visitors: number;
		pageviews: number;
		windowMinutes: number;
		paths: { path: string; count: number }[];
	};

	let live = $state<LiveSnapshot | null>(null);
	let liveStale = $state(false);

	onMount(() => {
		let cancelled = false;
		const POLL_MS = 20_000;

		async function poll() {
			try {
				const response = await fetch(`/websites/${data.website.id}/analytics/live`, {
					headers: { accept: 'application/json' }
				});
				if (!response.ok) throw new Error(`live stats ${response.status}`);
				const snapshot = (await response.json()) as LiveSnapshot;
				if (!cancelled) {
					live = snapshot;
					liveStale = false;
				}
			} catch {
				if (!cancelled) liveStale = true;
			}
		}

		poll();
		const timer = setInterval(poll, POLL_MS);
		return () => {
			cancelled = true;
			clearInterval(timer);
		};
	});

	const report = $derived(data.report);
	const totals = $derived(report.totals);
	const hasData = $derived(totals.pageviews > 0);

	const pagesPerVisit = $derived(
		totals.visits > 0 ? (totals.pageviews / totals.visits).toFixed(1) : '0'
	);

	const ranges = $derived([
		{ days: 7, label: '7 days' },
		{ days: 30, label: '30 days' },
		{ days: 90, label: '90 days' }
	]);

	const devices = $derived(
		report.devices.map((item) => ({ label: deviceLabel(item.label), value: item.value }))
	);
	const countries = $derived(
		report.countries.map((item) => ({ label: countryName(item.label), value: item.value }))
	);
	const languages = $derived(
		report.languages.map((item) => ({ label: languageName(item.label), value: item.value }))
	);
	const channels = $derived(
		report.channels.map((item) => ({ label: channelLabel(item.label), value: item.value }))
	);
	const referrers = $derived(
		report.referrers.map((item) => ({ label: item.referrerHost, value: item.pageviews }))
	);
	const campaigns = $derived(
		report.utmCampaigns.map((item) => ({ label: item.label, value: item.value }))
	);

	function pageLabel(path: string): string {
		return path === '/' ? 'Home page' : path;
	}
</script>

<svelte:head>
	<title>Analytics — {data.website.name} — {PRODUCT_NAME}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<a
			href="/websites/{data.website.id}"
			class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
		>
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Back to {data.website.name}
		</a>
	</div>

	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-white">Analytics</h1>
			<p class="mt-1 text-sm text-zinc-500">
				{data.website.name} &middot; <span class="font-mono">/{data.website.slug}</span>
			</p>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<div class="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
				{#each ranges as range}
					<a
						href="?range={range.days}"
						class="rounded-md px-3 py-1.5 text-xs font-medium transition-all
							{data.days === range.days
							? 'bg-zinc-800 text-white'
							: 'text-zinc-400 hover:text-zinc-200'}"
					>
						{range.label}
					</a>
				{/each}
			</div>

			<a
				href="/websites/{data.website.id}/analytics/export?range={data.days}"
				class="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
			>
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
				</svg>
				Export CSV
			</a>

			<a
				href="/websites/{data.website.id}"
				class="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
			>
				Manage site
			</a>
		</div>
	</div>

	{#if !hasData}
		<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
			<h2 class="text-sm font-semibold text-emerald-300">Waiting for the first visitor</h2>
			<p class="mt-1 text-sm text-zinc-400">
				Views are counted on the server as soon as someone opens
				<a href={data.publicUrl} target="_blank" rel="noopener noreferrer" class="text-emerald-400 underline decoration-emerald-500/30 underline-offset-2">{data.publicUrl}</a>.
				Nothing has been recorded in the last {data.days} days yet.
			</p>
		</div>
	{/if}

	<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="flex items-center gap-2.5">
				<span class="relative flex h-2.5 w-2.5">
					{#if live && live.visitors > 0}
						<span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
					{/if}
					<span
						class="relative inline-flex h-2.5 w-2.5 rounded-full {live && live.visitors > 0
							? 'bg-emerald-400'
							: 'bg-zinc-600'}"
					></span>
				</span>
				<p class="text-sm text-zinc-300">
					{#if !live}
						Checking who is on the site...
					{:else if live.visitors === 0}
						<span class="text-zinc-400">Nobody on the site right now</span>
					{:else}
						<span class="font-semibold text-white">{formatNumber(live.visitors)}</span>
						{live.visitors === 1 ? 'person' : 'people'} on the site
						<span class="text-zinc-500">
							&middot; {formatNumber(live.pageviews)} pageview{live.pageviews === 1 ? '' : 's'} in
							the last {live.windowMinutes} minutes
						</span>
					{/if}
				</p>
			</div>
			{#if liveStale}
				<p class="text-xs text-amber-400/80">Live updates paused, retrying</p>
			{/if}
		</div>

		{#if live && live.paths.length > 0}
			<div class="mt-3 flex flex-wrap gap-2">
				{#each live.paths as entry (entry.path)}
					<span class="rounded-full bg-zinc-800/80 px-2.5 py-1 font-mono text-[11px] text-zinc-400">
						{pageLabel(entry.path)}
						<span class="text-zinc-600">·</span>
						{entry.count}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<StatCard label="Pageviews" value={formatNumber(totals.pageviews)} hint={`Last ${data.days} days`} accent />
		<StatCard label="Unique visitors" value={formatNumber(totals.visitors)} hint="Daily-salted, no cookies" />
		<StatCard label="Visits" value={formatNumber(totals.visits)} hint="30-minute sessions" />
		<StatCard label="Pages per visit" value={pagesPerVisit} hint="Views ÷ visits" />
		<StatCard label="Avg. engagement" value={formatDuration(totals.averageEngagementSeconds)} hint="Visible time per page" />
		<StatCard label="Bounce rate" value={`${totals.bounceRate}%`} hint="Visits with one pageview" />
		<StatCard label="Outbound clicks" value={formatNumber(totals.outboundClicks)} hint="Links leaving the site" />
		<StatCard label="Downloads" value={formatNumber(totals.downloads)} hint="PDFs, zips and archives" />
	</div>

	{#if totals.notFound > 0}
		<div class="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
			<svg class="mt-0.5 h-4 w-4 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
			</svg>
			<p class="text-sm text-zinc-300">
				<strong class="font-semibold text-amber-300">{formatNumber(totals.notFound)}</strong>
				request{totals.notFound === 1 ? '' : 's'} hit a missing page on this site.
				Often an old link or a typo in a relative asset path.
			</p>
		</div>
	{/if}

	<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
			<h2 class="text-sm font-semibold text-zinc-200">Traffic</h2>
			<div class="flex items-center gap-4 text-xs text-zinc-400">
				<span class="flex items-center gap-1.5">
					<span class="h-0.5 w-4 rounded bg-emerald-400"></span>Pageviews
				</span>
				<span class="flex items-center gap-1.5">
					<span class="h-0.5 w-4 rounded bg-sky-400" style="border-top: 1px dashed #38bdf8; background: transparent;"></span>Visitors
				</span>
			</div>
		</div>
		<TrendChart series={report.series} />
	</div>

	<div class="grid grid-cols-1 gap-4 lg:grid-cols-5">
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-3">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Top pages</h2>
			{#if report.topPages.length === 0}
				<p class="py-3 text-sm text-zinc-500">No pageviews recorded yet.</p>
			{:else}
				<div class="-mx-2 overflow-x-auto">
					<table class="w-full min-w-[420px] text-sm">
						<thead>
							<tr class="border-b border-zinc-800 text-left text-xs uppercase tracking-wider text-zinc-500">
								<th class="px-2 pb-2 font-medium">Page</th>
								<th class="px-2 pb-2 text-right font-medium">Views</th>
								<th class="px-2 pb-2 text-right font-medium">Visitors</th>
								<th class="px-2 pb-2 text-right font-medium">Avg. time</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-zinc-800/70">
							{#each report.topPages as page (page.path)}
								<tr>
									<td class="max-w-[220px] px-2 py-2.5">
										<span class="block truncate font-mono text-xs text-zinc-300" title={page.path}>
											{pageLabel(page.path)}
										</span>
									</td>
									<td class="px-2 py-2.5 text-right tabular-nums text-zinc-200">{formatNumber(page.pageviews)}</td>
									<td class="px-2 py-2.5 text-right tabular-nums text-zinc-400">{formatNumber(page.visitors)}</td>
									<td class="px-2 py-2.5 text-right tabular-nums text-zinc-400">
										{page.averageEngagementSeconds === null ? 'n/a' : formatDuration(page.averageEngagementSeconds)}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 lg:col-span-2">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Referrers</h2>
			<BarList items={referrers} emptyLabel="All traffic arrived directly" formatValue={formatNumber} />
			{#if channels.length > 0}
				<div class="mt-5 border-t border-zinc-800 pt-4">
					<p class="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">Channels</p>
					<div class="flex flex-wrap gap-1.5">
						{#each channels as channel (channel.label)}
							<span class="inline-flex items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300">
								{channel.label}
								<span class="tabular-nums text-zinc-500">{formatNumber(channel.value)}</span>
							</span>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Devices</h2>
			<BarList items={devices} formatValue={formatNumber} />
		</div>
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Browsers</h2>
			<BarList items={report.browsers} formatValue={formatNumber} barClass="bg-sky-400/70" />
		</div>
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Operating systems</h2>
			<BarList items={report.operatingSystems} formatValue={formatNumber} barClass="bg-violet-400/70" />
		</div>
	</div>

	<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Countries</h2>
			<BarList items={countries} formatValue={formatNumber} />
		</div>
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Languages</h2>
			<BarList items={languages} formatValue={formatNumber} barClass="bg-amber-400/70" />
		</div>
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 class="mb-4 text-sm font-semibold text-zinc-200">Campaigns</h2>
			<BarList
				items={campaigns}
				emptyLabel="No utm_campaign links used yet"
				formatValue={formatNumber}
				barClass="bg-pink-400/70"
			/>
			<p class="mt-3 text-xs text-zinc-500">
				Add <span class="font-mono text-zinc-400">?utm_source=…&amp;utm_campaign=…</span> to a link to see it here.
			</p>
		</div>
	</div>

	<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
		<h2 class="mb-4 text-sm font-semibold text-zinc-200">When people visit</h2>
		<Heatmap cells={report.heatmap} />
	</div>

	<div class="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 text-xs text-zinc-500">
		<svg class="h-4 w-4 shrink-0 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
			<path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
		</svg>
		<p class="max-w-3xl">
			No cookies, no IP addresses, no cross-site profiles. Unique visitors use a hash that is salted
			with a key discarded every day, so yesterday cannot be linked to today. Do Not Track and Global
			Privacy Control are honoured. <a href="/privacy" class="text-emerald-400 underline decoration-emerald-500/30 underline-offset-2 hover:text-emerald-300">Full details</a>.
		</p>
	</div>
</div>

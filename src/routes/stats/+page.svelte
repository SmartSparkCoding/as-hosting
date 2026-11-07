<script lang="ts">
	import { PRODUCT_NAME } from '$lib/constants';
	import { formatNumber } from '$lib/analytics';
	import StatCard from '$lib/components/analytics/StatCard.svelte';
	import Sparkline from '$lib/components/analytics/Sparkline.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const stats = $derived(data.stats);
	const series = $derived(stats?.series ?? []);
	const sites = $derived(stats?.sites ?? []);
	const busiest = $derived(sites[0] ?? null);
	const maxWeekPageviews = $derived(Math.max(1, ...sites.map((site) => site.weekPageviews)));

	function barWidth(value: number): string {
		return `${Math.max(2, Math.round((value / maxWeekPageviews) * 100))}%`;
	}
</script>

<svelte:head>
	<title>Club stats — {PRODUCT_NAME}</title>
	<meta name="description" content="Pageviews for every public club website hosted on {PRODUCT_NAME}." />
</svelte:head>

<div class="mx-auto max-w-5xl px-4 py-12">
	<p class="text-xs font-medium uppercase tracking-wider text-emerald-400">Public</p>
	<h1 class="mt-2 text-3xl font-bold tracking-tight text-white">{data.clubName} sites</h1>
	<p class="mt-3 max-w-2xl text-sm text-zinc-400">
		How much the club's hosted websites are being read. Counts come from
		{PRODUCT_NAME}'s cookieless analytics, so nobody is tracked and no personal data is stored.
		Only site totals appear here; per-page detail stays with each site's owner.
	</p>

	{#if !stats}
		<p class="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
			Stats are not available right now. Try again in a minute.
		</p>
	{:else}
		<div class="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			<StatCard
				label="Pageviews (7d)"
				value={formatNumber(stats.week.pageviews)}
				hint="Across all public sites"
				accent
			/>
			<StatCard
				label="Visitors (7d)"
				value={formatNumber(stats.week.visitors)}
				hint="Per-site uniques, added up"
			/>
			<StatCard label="Pageviews (30d)" value={formatNumber(stats.month.pageviews)} />
			<StatCard
				label="Sites with traffic"
				value={`${stats.activeSites}/${sites.length}`}
				hint="At least one view this week"
			/>
		</div>

		<section class="mt-6 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-sm font-semibold text-zinc-100">Last 30 days</h2>
				<p class="text-xs text-zinc-500">
					{formatNumber(stats.month.visitors)} visitors · updated {new Date(
						stats.generatedAt
					).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
				</p>
			</div>
			{#if series.length > 0}
				<div class="mt-4">
					<Sparkline {series} width={720} height={90} />
				</div>
			{:else}
				<p class="mt-3 text-sm text-zinc-500">No pageviews recorded yet.</p>
			{/if}
		</section>

		<section class="mt-6">
			<div class="flex flex-wrap items-baseline justify-between gap-2">
				<h2 class="text-sm font-semibold text-zinc-100">Sites this week</h2>
				{#if busiest}
					<p class="text-xs text-zinc-500">
						Busiest: <a class="text-emerald-400 hover:text-emerald-300" href="/{busiest.slug}/"
							>{busiest.name}</a
						>
					</p>
				{/if}
			</div>

			{#if sites.length === 0}
				<p class="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
					No public sites are listed yet.
				</p>
			{:else}
				<div class="mt-4 overflow-hidden rounded-xl border border-zinc-800">
					<table class="w-full border-collapse text-sm">
						<thead>
							<tr class="bg-zinc-900/70 text-left text-xs uppercase tracking-wider text-zinc-500">
								<th class="px-4 py-2.5 font-medium">Site</th>
								<th class="px-4 py-2.5 font-medium">This week</th>
								<th class="hidden px-4 py-2.5 font-medium sm:table-cell">Visitors</th>
								<th class="hidden px-4 py-2.5 font-medium sm:table-cell">30 days</th>
							</tr>
						</thead>
						<tbody>
							{#each sites as site (site.id)}
								<tr class="border-t border-zinc-800/80 text-zinc-300">
									<td class="px-4 py-2.5">
										<a class="font-medium text-zinc-100 hover:text-emerald-400" href="/{site.slug}/"
											>{site.name}</a
										>
										<span class="ml-2 font-mono text-[11px] text-zinc-600">/{site.slug}</span>
									</td>
									<td class="px-4 py-2.5">
										<div class="flex items-center gap-2">
											<span class="w-14 shrink-0 tabular-nums">{formatNumber(
													site.weekPageviews
												)}</span>
											<span class="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800 sm:w-32">
												<span
													class="block h-full rounded-full bg-emerald-500/70"
													style="width: {barWidth(site.weekPageviews)}"
												></span>
											</span>
										</div>
									</td>
									<td class="hidden px-4 py-2.5 tabular-nums sm:table-cell"
										>{formatNumber(site.weekVisitors)}</td
									>
									<td class="hidden px-4 py-2.5 tabular-nums text-zinc-500 sm:table-cell"
										>{formatNumber(site.monthPageviews)}</td
									>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>

		<p class="mt-6 text-xs text-zinc-500">
			Sites can opt out of this page, and unlisted or password protected sites never appear.
			Read how the counting works on the <a class="text-emerald-400 hover:text-emerald-300" href="/privacy"
				>privacy page</a
			>.
		</p>
	{/if}
</div>

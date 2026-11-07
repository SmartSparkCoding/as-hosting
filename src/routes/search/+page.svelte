<script lang="ts">
	import { enhance } from '$app/forms';
	import { PRODUCT_NAME } from '$lib/constants';
	import { timeAgo } from '$lib/utils';
	import type { ActionData, PageData, SubmitFunction } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let reindexing = $state(false);

	const resultCount = $derived(data.results.length);
	const searchable = $derived(data.query.length >= data.minQueryLength);
	const indexEmpty = $derived(data.stats.pages === 0);

	const summary = $derived(
		((form ?? null) as unknown as { summary?: { sites: number; pages: number; failed: number } } | null)
			?.summary ?? null
	);
	const formError = $derived(((form ?? null) as unknown as { error?: string } | null)?.error ?? null);

	const handleReindex: SubmitFunction = () => {
		reindexing = true;
		return async ({ update }) => {
			await update({ reset: false });
			reindexing = false;
		};
	};
</script>

<svelte:head>
	<title>Search — {PRODUCT_NAME}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-white">Search</h1>
		<p class="mt-1 text-sm text-zinc-400">
			Look through the words on every public club site. Unlisted and password protected sites stay out of
			these results.
		</p>
	</div>

	<form method="GET" class="flex flex-col gap-3 sm:flex-row">
		<label class="sr-only" for="search-input">Search terms</label>
		<input
			id="search-input"
			type="search"
			name="q"
			value={data.query}
			placeholder="robotics, portfolio, event poster"
			class="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none"
		/>
		<button
			type="submit"
			class="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
		>
			Search
		</button>
	</form>

	{#if formError}
		<div class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
			{formError}
		</div>
	{/if}

	{#if summary}
		<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
			Indexed {summary.pages} page{summary.pages === 1 ? '' : 's'} from {summary.sites} site{summary.sites === 1
				? ''
				: 's'}{summary.failed > 0 ? `, ${summary.failed} could not be read` : ''}.
		</div>
	{/if}

	{#if indexEmpty}
		<div class="rounded-xl border border-amber-500/20 bg-amber-500/5 px-5 py-4 text-sm text-amber-200">
			<p class="font-medium text-amber-100">Nothing is indexed yet.</p>
			<p class="mt-1 text-amber-200/80">
				Pages are added after every deploy. To fill the index now, rebuild it from the sites that are live.
			</p>
			<form method="POST" action="?/reindex" use:enhance={handleReindex} class="mt-3">
				<button
					type="submit"
					disabled={reindexing}
					class="rounded-lg border border-amber-400/40 px-4 py-1.5 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-400/10 disabled:opacity-60"
				>
					{reindexing ? 'Rebuilding...' : 'Rebuild index'}
				</button>
			</form>
		</div>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-500">
			<span>
				{#if searchable}
					{resultCount} result{resultCount === 1 ? '' : 's'} for <span class="text-zinc-300">"{data.query}"</span>
				{:else}
					Type at least {data.minQueryLength} characters to search.
				{/if}
			</span>
			<span>
				{data.stats.pages} pages from {data.stats.sites} site{data.stats.sites === 1 ? '' : 's'} indexed{#if data.stats.lastIndexedAt}, updated {timeAgo(data.stats.lastIndexedAt)}{/if}
			</span>
		</div>

		{#if searchable && resultCount === 0}
			<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
				<p class="text-sm text-zinc-400">Nothing on a public site matched that.</p>
				<p class="mt-1 text-sm text-zinc-600">Try a shorter word, or one that would appear on the page itself.</p>
			</div>
		{:else if resultCount > 0}
			<ul class="space-y-3">
				{#each data.results as hit (hit.websiteId + hit.path)}
					<li class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
						<div class="flex flex-wrap items-baseline justify-between gap-2">
							<div class="flex items-baseline gap-2">
								<span class="font-medium text-white">{hit.siteName}</span>
								<span class="font-mono text-xs text-zinc-500">{hit.path}</span>
							</div>
							<a
								href="/{hit.slug}{hit.path === '/' ? '/' : hit.path}"
								class="text-xs text-emerald-400 transition-colors hover:text-emerald-300"
							>
								Open page
							</a>
						</div>
						{#if hit.title && hit.title !== hit.siteName}
							<p class="mt-2 text-sm font-medium text-zinc-300">{hit.title}</p>
						{/if}
						<p class="mt-2 text-sm leading-relaxed text-zinc-400 [&_mark]:bg-emerald-500/20 [&_mark]:text-emerald-200">
							{@html hit.snippet}
						</p>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

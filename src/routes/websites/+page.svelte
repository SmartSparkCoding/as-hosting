<script lang="ts">
	import { timeAgo, formatBytes } from '$lib/utils';
	import { Permission } from '$lib/permissions';
	import { PRODUCT_NAME } from '$lib/constants';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let activeFilter = $state<'all' | 'ACTIVE' | 'ARCHIVED'>('all');

	const canCreate = $derived(data.permissions.includes(Permission.CREATE_WEBSITE));

	const filteredWebsites = $derived(
		activeFilter === 'all'
			? data.websites
			: data.websites.filter((w) => w.status === activeFilter)
	);

	function statusColor(status: string) {
		switch (status) {
			case 'ACTIVE': return 'bg-emerald-400';
			case 'BUILDING': return 'bg-amber-400 animate-pulse';
			case 'FAILED': return 'bg-red-400';
			case 'ARCHIVED': return 'bg-zinc-500';
			default: return 'bg-zinc-500';
		}
	}

	function statusLabel(status: string) {
		switch (status) {
			case 'ACTIVE': return 'Active';
			case 'BUILDING': return 'Building';
			case 'FAILED': return 'Failed';
			case 'ARCHIVED': return 'Archived';
			default: return status;
		}
	}

	const tabs = [
		{ key: 'all' as const, label: 'All' },
		{ key: 'ACTIVE' as const, label: 'Active' },
		{ key: 'ARCHIVED' as const, label: 'Archived' }
	];
</script>

<svelte:head>
	<title>Websites — {PRODUCT_NAME}</title>
</svelte:head>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-2xl font-bold tracking-tight text-white">Websites</h1>
			<p class="mt-1 text-sm text-zinc-400">
				{data.websites.length} total &middot; {data.websites.filter((w) => w.status === 'ACTIVE').length} live
			</p>
		</div>
		{#if canCreate}
			<a
				href="/websites/new"
				class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/30 active:scale-[0.98]"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
				</svg>
				Add website
			</a>
		{/if}
	</div>

	<div class="flex items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 w-fit">
		{#each tabs as tab}
			<button
				type="button"
				onclick={() => (activeFilter = tab.key)}
				class="rounded-md px-3.5 py-1.5 text-sm font-medium transition-all
					{activeFilter === tab.key
						? 'bg-zinc-800 text-white shadow-sm'
						: 'text-zinc-400 hover:text-zinc-200'}"
			>
				{tab.label}
				{#if tab.key !== 'all'}
					<span class="ml-1 text-zinc-500">
						{data.websites.filter((w) => w.status === tab.key).length}
					</span>
				{:else}
					<span class="ml-1 text-zinc-500">{data.websites.length}</span>
				{/if}
			</button>
		{/each}
	</div>

	{#if filteredWebsites.length === 0}
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
			<div class="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800">
				<svg class="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
				</svg>
			</div>
			<h3 class="text-sm font-semibold text-zinc-200">
				{activeFilter === 'all' ? 'No websites' : `No ${activeFilter.toLowerCase()} websites`}
			</h3>
			<p class="mt-1 text-sm text-zinc-500">
				{activeFilter === 'all'
					? 'Deploy your first project to get started.'
					: 'Try a different filter.'}
			</p>
			{#if activeFilter === 'all' && canCreate}
				<a
					href="/websites/new"
					class="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" />
					</svg>
					Add website
				</a>
			{/if}
		</div>
	{:else}
		<div class="space-y-3">
			{#each filteredWebsites as website (website.id)}
				<div class="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 transition-colors hover:border-zinc-700">
					<span class="h-2.5 w-2.5 shrink-0 rounded-full {statusColor(website.status)}"></span>

					<div class="min-w-0 flex-1">
						<div class="flex items-center gap-2">
							<h3 class="truncate text-sm font-semibold text-white">{website.name}</h3>
							<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium
								{website.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' :
								  website.status === 'BUILDING' ? 'bg-amber-500/10 text-amber-400' :
								  website.status === 'FAILED' ? 'bg-red-500/10 text-red-400' :
								  'bg-zinc-500/10 text-zinc-400'}">
								{statusLabel(website.status)}
							</span>
						</div>
						<div class="mt-1 flex items-center gap-4 text-xs text-zinc-500">
							<span>/{website.slug}</span>
							<span>{formatBytes(website.storageBytes)}</span>
							<span>
								{(data.analytics[website.id]?.pageviews ?? 0).toLocaleString('en-GB')}
								{(data.analytics[website.id]?.pageviews ?? 0) === 1 ? 'view' : 'views'}
							</span>
							<span>{timeAgo(website.createdAt)}</span>
						</div>
					</div>

					<div class="flex shrink-0 items-center gap-2">
						<a
							href="/websites/{website.id}"
							class="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
						>
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							Manage
						</a>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

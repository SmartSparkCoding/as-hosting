<script lang="ts">
	import { enhance } from '$app/forms';
	import { timeAgo, formatBytes } from '$lib/utils';
	import { Permission } from '$lib/permissions';
	import { PRODUCT_NAME } from '$lib/constants';
	import type { ActionData, PageData, SubmitFunction } from './$types';

	interface BulkOutcome {
		op: string;
		done: string[];
		skipped: { name: string; reason: string }[];
		section?: string;
	}

	interface FormShape {
		error?: string;
		success?: boolean;
		bulk?: BulkOutcome;
	}

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let activeFilter = $state<'all' | 'ACTIVE' | 'ARCHIVED'>('all');
	let activeSection = $state<string>('all');
	let selected = $state<string[]>([]);

	const canCreate = $derived(data.permissions.includes(Permission.CREATE_WEBSITE));
	const canArchive = $derived(data.permissions.includes(Permission.ARCHIVE_WEBSITE));

	const bulkResult = $derived(((form ?? null) as unknown as FormShape | null)?.bulk ?? null);
	const formError = $derived(((form ?? null) as unknown as FormShape | null)?.error ?? null);

	const OP_LABELS: Record<string, string> = {
		public: 'made public',
		unlisted: 'made unlisted',
		password: 'password protected',
		archive: 'archived',
		relaunch: 'relaunched',
		group: 'moved into a section',
		ungroup: 'removed from their section'
	};

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

	function visibilityLabel(visibility: string) {
		switch (visibility) {
			case 'UNLISTED': return 'Unlisted';
			case 'PASSWORD': return 'Password';
			default: return 'Public';
		}
	}

	function visibilityTone(visibility: string) {
		switch (visibility) {
			case 'UNLISTED': return 'bg-sky-500/10 text-sky-400';
			case 'PASSWORD': return 'bg-amber-500/10 text-amber-400';
			default: return 'bg-emerald-500/10 text-emerald-400';
		}
	}

	const tabs = [
		{ key: 'all' as const, label: 'All' },
		{ key: 'ACTIVE' as const, label: 'Active' },
		{ key: 'ARCHIVED' as const, label: 'Archived' }
	];

	const matches = $derived.by(() => {
		return (website: PageData['websites'][number]) => {
			if (activeFilter !== 'all' && website.status !== activeFilter) return false;
			if (activeSection === 'all') return true;
			if (activeSection === 'none') return !website.groupId;
			return website.groupId === activeSection;
		};
	});

	const visibleWebsites = $derived(data.websites.filter(matches));

	/** One block per section, plus the sites that are not in a section. */
	const blocks = $derived.by(() => {
		const groups = data.groups ?? [];
		const result = groups
			.map((group) => ({
				id: group.id as string | null,
				name: group.name,
				slug: group.slug,
				description: group.description,
				sites: visibleWebsites.filter((website) => website.groupId === group.id)
			}))
			.filter((block) => block.sites.length > 0);

		const loose = visibleWebsites.filter((website) => !website.groupId);
		if (loose.length > 0) {
			result.push({ id: null, name: 'No section', slug: '', description: null, sites: loose });
		}
		return result;
	});

	const sectionChips = $derived.by(() => {
		const groups = data.groups ?? [];
		const chips = [{ key: 'all', label: 'All sections' }];
		for (const group of groups) chips.push({ key: group.id, label: group.name });
		if (data.websites.some((website) => !website.groupId)) chips.push({ key: 'none', label: 'No section' });
		return chips;
	});

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
	}

	function selectAllVisible() {
		selected = visibleWebsites.map((website) => website.id);
	}

	const allVisibleSelected = $derived(
		visibleWebsites.length > 0 && visibleWebsites.every((website) => selected.includes(website.id))
	);

	const handleBulkEnhance: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'success') selected = [];
			await update({ reset: false });
		};
	};

	const handleSectionEnhance: SubmitFunction = () => {
		return async ({ update }) => {
			await update({ reset: false });
		};
	};
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
				{#if (data.groups ?? []).length > 0}
					&middot; {(data.groups ?? []).length} section{(data.groups ?? []).length === 1 ? '' : 's'}
				{/if}
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

	{#if formError}
		<div class="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
			{formError}
		</div>
	{/if}

	{#if bulkResult}
		<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm">
			<p class="font-medium text-emerald-400">
				{bulkResult.done.length}
				{bulkResult.done.length === 1 ? 'website' : 'websites'}
				{OP_LABELS[bulkResult.op] ?? 'updated'}
				{#if bulkResult.section}
					&middot; section "{bulkResult.section}"
				{/if}
			</p>
			{#if bulkResult.done.length > 0}
				<p class="mt-1 text-xs text-zinc-400">{bulkResult.done.join(', ')}</p>
			{/if}
			{#if bulkResult.skipped.length > 0}
				<p class="mt-2 text-xs text-amber-400">
					Skipped:
					{bulkResult.skipped.map((item) => `${item.name} (${item.reason})`).join(', ')}
				</p>
			{/if}
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-2">
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
					<span class="ml-1 text-zinc-500">
						{tab.key === 'all'
							? data.websites.length
							: data.websites.filter((w) => w.status === tab.key).length}
					</span>
				</button>
			{/each}
		</div>

		{#if sectionChips.length > 2}
			<div class="flex flex-wrap items-center gap-1">
				{#each sectionChips as chip}
					<button
						type="button"
						onclick={() => (activeSection = chip.key)}
						class="rounded-full border px-3 py-1 text-xs font-medium transition-colors
							{activeSection === chip.key
								? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
								: 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'}"
					>
						{chip.label}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Bulk actions for ticked sites. The checkboxes below point at this form by id. -->
	<form
		id="bulk-form"
		method="POST"
		action="?/bulk"
		use:enhance={handleBulkEnhance}
		class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4"
	>
		<div class="flex flex-wrap items-center gap-2">
			<span class="text-sm font-semibold text-white">
				{selected.length} selected
			</span>
			<button
				type="button"
				onclick={allVisibleSelected ? () => (selected = []) : selectAllVisible}
				class="rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
			>
				{allVisibleSelected ? 'Clear selection' : `Select all ${visibleWebsites.length}`}
			</button>
			<span class="text-xs text-zinc-500">Tick sites below, or use a section's own bulk actions.</span>
		</div>

		<div class="mt-3 flex flex-wrap items-center gap-2">
			<select
				name="op"
				class="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200"
			>
				<option value="unlisted">Make unlisted</option>
				<option value="public">Make public</option>
				<option value="password">Password protect</option>
				<option value="archive">Archive</option>
				<option value="relaunch">Relaunch</option>
				<option value="group">Move into a section</option>
				<option value="ungroup">Remove from section</option>
			</select>
			<input
				type="password"
				name="accessPassword"
				placeholder="Shared password (for password protect)"
				class="w-64 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
			/>
			<input
				type="text"
				name="groupName"
				placeholder="Section name (for move into a section)"
				class="w-64 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
			/>
			<button
				type="submit"
				disabled={selected.length === 0}
				class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
			>
				Apply to selected
			</button>
		</div>
	</form>

	{#if visibleWebsites.length === 0}
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
		<div class="space-y-8">
			{#each blocks as block (block.id ?? 'none')}
				<section class="space-y-3">
					{#if block.id}
						<div class="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-2">
							<div class="min-w-0">
								<div class="flex items-center gap-2">
									<h2 class="truncate text-sm font-semibold text-white">{block.name}</h2>
									<span class="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
										{block.sites.length} site{block.sites.length === 1 ? '' : 's'}
									</span>
								</div>
								{#if block.description}
									<p class="mt-0.5 truncate text-xs text-zinc-500">{block.description}</p>
								{/if}
							</div>
							<div class="flex items-center gap-3">
								<a
									href="/{block.slug}"
									target="_blank"
									rel="noreferrer"
									class="text-xs font-medium text-emerald-400 hover:text-emerald-300"
								>
									View section page &nearr;
								</a>
								<details class="relative">
									<summary
										class="cursor-pointer list-none rounded-lg border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
									>
										Section bulk actions
									</summary>
									<form
										method="POST"
										action="?/groupBulk"
										use:enhance={handleSectionEnhance}
										class="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3"
									>
										<input type="hidden" name="groupId" value={block.id} />
										<select
											name="op"
											class="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200"
										>
											<option value="unlisted">Make all unlisted</option>
											<option value="password">Password protect all</option>
											<option value="public">Make all public</option>
											{#if canArchive}
												<option value="archive">Archive all</option>
											{/if}
											<option value="relaunch">Relaunch all</option>
											<option value="ungroup">Remove all from section</option>
										</select>
										<input
											type="password"
											name="accessPassword"
											placeholder="password (for password protect)"
											class="w-56 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
										/>
										<button
											type="submit"
											class="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
										>
											Apply to all {block.sites.length}
										</button>
									</form>
								</details>
							</div>
						</div>
					{:else}
						<h2 class="text-sm font-semibold text-zinc-400">No section</h2>
					{/if}

					<div class="space-y-3">
						{#each block.sites as website (website.id)}
							<div class="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4 transition-colors hover:border-zinc-700">
								<input
									type="checkbox"
									form="bulk-form"
									name="ids"
									value={website.id}
									checked={selected.includes(website.id)}
									onchange={() => toggle(website.id)}
									aria-label="Select {website.name}"
									class="h-4 w-4 shrink-0 rounded border-zinc-700 bg-zinc-950 accent-emerald-500"
								/>
								<span class="h-2.5 w-2.5 shrink-0 rounded-full {statusColor(website.status)}"></span>

								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<h3 class="truncate text-sm font-semibold text-white">{website.name}</h3>
										<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium
											{website.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' :
											  website.status === 'BUILDING' ? 'bg-amber-500/10 text-amber-400' :
											  website.status === 'FAILED' ? 'bg-red-500/10 text-red-400' :
											  'bg-zinc-500/10 text-zinc-400'}">
											{statusLabel(website.status)}
										</span>
										<span class="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium {visibilityTone(website.visibility)}">
											{visibilityLabel(website.visibility)}
										</span>
									</div>
									<div class="mt-1 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
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
				</section>
			{/each}
		</div>
	{/if}
</div>

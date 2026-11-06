<script lang="ts">
	import { formatDate, timeAgo, formatBytes } from '$lib/utils';
	import { Permission } from '$lib/permissions';
	import { PRODUCT_NAME } from '$lib/constants';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const canManage = $derived(data.permissions.includes(Permission.CREATE_WEBSITE));
	const canViewAudit = $derived(data.permissions.includes(Permission.VIEW_DASHBOARD));

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

	function actionLabel(action: string) {
		if (action.includes('website.created')) return 'Created a website';
		if (action.includes('website.deployed')) return 'Deployed a website';
		if (action.includes('website.archived')) return 'Archived a website';
		if (action.includes('website.relaunched')) return 'Relaunched a website';
		if (action.includes('website.deleted')) return 'Deleted a website';
		if (action.includes('website.updated')) return 'Updated a website';
		if (action.includes('login.success')) return 'Signed in';
		if (action.includes('session.created')) return 'Created session';
		if (action.includes('session.deleted')) return 'Revoked session';
		if (action.includes('user.password_reset')) return 'Reset a password';
		if (action.includes('user.password_changed')) return 'Changed password';
		if (action.includes('user.created')) return 'Added a person';
		if (action.includes('user.deactivated')) return 'Deactivated a person';
		return action;
	}

	const userWebsites = $derived(data.websites.filter((w) => w.createdBy === data.user?.id));
	const displayWebsites = $derived(userWebsites.length > 0 ? userWebsites : data.websites.slice(0, 6));
</script>

<svelte:head>
	<title>Dashboard — {PRODUCT_NAME}</title>
</svelte:head>

<div class="space-y-8">
	<div>
		<h1 class="text-2xl font-bold tracking-tight text-white">
			Welcome back, {data.user?.name.split(' ')[0]}
		</h1>
		<p class="mt-1 text-sm text-zinc-400">
			Here's what's going on with your hosted projects.
		</p>
	</div>

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-zinc-400">Active</span>
				<span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10">
					<svg class="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-white">{data.stats.active}</p>
			<p class="mt-1 text-xs text-zinc-500">websites live</p>
		</div>
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-zinc-400">Archived</span>
				<span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-500/10">
					<svg class="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
					</svg>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-white">{data.stats.archived}</p>
			<p class="mt-1 text-xs text-zinc-500">projects paused</p>
		</div>
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-zinc-400">Storage</span>
				<span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10">
					<svg class="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
					</svg>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-white">{data.stats.storage}</p>
			<p class="mt-1 text-xs text-zinc-500">total used</p>
		</div>
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<div class="flex items-center justify-between">
				<span class="text-sm font-medium text-zinc-400">Views</span>
				<span class="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10">
					<svg class="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
						<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
					</svg>
				</span>
			</div>
			<p class="mt-2 text-3xl font-bold text-white">{data.stats.views.toLocaleString('en-GB')}</p>
			<p class="mt-1 text-xs text-zinc-500">pageviews, last 7 days</p>
		</div>
	</div>

	<div class="flex items-center justify-between">
		<div>
			<h2 class="text-lg font-semibold text-white">Your websites</h2>
			<p class="text-sm text-zinc-500">{data.stats.total} total</p>
		</div>
		{#if canManage}
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

	{#if displayWebsites.length === 0}
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-12 text-center">
			<div class="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-800">
				<svg class="h-6 w-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
					<path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
				</svg>
			</div>
			<h3 class="text-sm font-semibold text-zinc-200">No websites yet</h3>
			<p class="mt-1 text-sm text-zinc-500">Deploy your first project to get started.</p>
			{#if canManage}
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
		<div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{#each displayWebsites as website (website.id)}
				<div class="group rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 transition-colors hover:border-zinc-700">
					<div class="flex items-start justify-between">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<span class="h-2 w-2 rounded-full {statusColor(website.status)}"></span>
								<h3 class="truncate text-sm font-semibold text-white">{website.name}</h3>
							</div>
							<p class="mt-1 truncate text-xs text-zinc-500">/{website.slug}</p>
						</div>
						<span class="ml-3 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium
							{website.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400' :
							  website.status === 'BUILDING' ? 'bg-amber-500/10 text-amber-400' :
							  website.status === 'FAILED' ? 'bg-red-500/10 text-red-400' :
							  'bg-zinc-500/10 text-zinc-400'}">
							{statusLabel(website.status)}
						</span>
					</div>

					<div class="mt-3 space-y-1.5 text-xs text-zinc-500">
						<div class="flex items-center gap-2">
							<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
							</svg>
							<a
								href="{data.baseUrl}/{website.slug}/"
								target="_blank"
								rel="noopener noreferrer"
								class="truncate text-zinc-400 underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-emerald-400"
							>
								{data.baseUrl}/{website.slug}/
							</a>
						</div>
						<div class="flex items-center gap-2">
							<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
							</svg>
							<span>Created {timeAgo(website.createdAt)}</span>
						</div>
						<div class="flex items-center gap-2">
							<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" />
							</svg>
							<span>{formatBytes(website.storageBytes)}</span>
						</div>
						<div class="flex items-center gap-2">
							<svg class="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
								<path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
							</svg>
							<span>
								{(data.analytics[website.id]?.pageviews ?? 0).toLocaleString('en-GB')}
								{(data.analytics[website.id]?.pageviews ?? 0) === 1 ? 'view' : 'views'}
								&middot;
								{(data.analytics[website.id]?.visitors ?? 0).toLocaleString('en-GB')}
								{(data.analytics[website.id]?.visitors ?? 0) === 1 ? 'visitor' : 'visitors'}
							</span>
						</div>
					</div>

					<div class="mt-4 flex items-center gap-2">
						<a
							href="{data.baseUrl}/{website.slug}/"
							target="_blank"
							rel="noopener noreferrer"
							class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
						>
							<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
							</svg>
							Open
						</a>
						<a
							href="/websites/{website.id}"
							class="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
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

	{#if canViewAudit && data.auditLogs.length > 0}
		<div>
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-white">Recent activity</h2>
				<a href="/settings" class="text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300">
					View all
				</a>
			</div>
			<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 divide-y divide-zinc-800">
				{#each data.auditLogs as log (log.id)}
					<div class="flex items-center gap-3 px-5 py-3">
						<div class="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-600"></div>
						<div class="min-w-0 flex-1">
							<p class="text-sm text-zinc-300">
								<span class="font-medium text-zinc-200">{log.userName}</span>
								{#if log.details}
									{' '}{log.details}
								{:else}
									{' '}{actionLabel(log.action)}
								{/if}
							</p>
						</div>
						<span class="shrink-0 text-xs text-zinc-600">{timeAgo(log.createdAt)}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<script lang="ts">
	import { enhance } from '$app/forms';
	import Sparkline from '$lib/components/analytics/Sparkline.svelte';
	import { formatDuration, formatNumber } from '$lib/analytics';
	import { PRODUCT_NAME } from '$lib/constants';
	import { Permission } from '$lib/permissions';
	import { formatBytes, formatDate, timeAgo } from '$lib/utils';
	import type { PageData, ActionData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let showArchiveDialog = $state(false);
	let showRelaunchDialog = $state(false);
	let showDeleteDialog = $state(false);
	let logExpanded = $state(false);
	let deploying = $state(false);
	let archiving = $state(false);
	let relaunching = $state(false);
	let deleting = $state(false);
	let relaunchExpiry = $state('');
	let copiedUrl = $state(false);

	const website = $derived(data.website);
	const baseUrl = $derived(data.publicUrl);

	const canEdit = $derived(data.permissions.includes(Permission.EDIT_WEBSITE));
	const canArchive = $derived(data.permissions.includes(Permission.ARCHIVE_WEBSITE));
	const canRelaunch = $derived(data.permissions.includes(Permission.RELAUNCH_WEBSITE));
	const canDelete = $derived(data.permissions.includes(Permission.DELETE_WEBSITE));
	const canViewLogs = $derived(data.permissions.includes(Permission.VIEW_BUILD_LOGS));

	function statusColor(status: string) {
		switch (status) {
			case 'ACTIVE': return 'bg-emerald-400';
			case 'BUILDING': return 'bg-amber-400 animate-pulse';
			case 'FAILED': return 'bg-red-400';
			case 'ARCHIVED': return 'bg-zinc-500';
			default: return 'bg-zinc-500';
		}
	}

	function statusBg(status: string) {
		switch (status) {
			case 'ACTIVE': return 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20';
			case 'BUILDING': return 'bg-amber-500/10 text-amber-400 ring-amber-500/20';
			case 'FAILED': return 'bg-red-500/10 text-red-400 ring-red-500/20';
			case 'ARCHIVED': return 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20';
			default: return 'bg-zinc-500/10 text-zinc-400 ring-zinc-500/20';
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

	function copyUrl() {
		navigator.clipboard.writeText(baseUrl);
		copiedUrl = true;
		setTimeout(() => (copiedUrl = false), 2000);
	}

	function latestDeployment() {
		return data.deployments[0] ?? null;
	}

	$effect(() => {
		if (form?.success) {
			showArchiveDialog = false;
			showRelaunchDialog = false;
			showDeleteDialog = false;
			deploying = false;
			archiving = false;
			relaunching = false;
			deleting = false;
		}
	});
</script>

<svelte:head>
	<title>{website.name} — {PRODUCT_NAME}</title>
</svelte:head>

<div class="space-y-6">
	<div>
		<a href="/websites" class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Back to websites
		</a>
	</div>

	<div class="flex flex-wrap items-start justify-between gap-4">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-2xl font-bold tracking-tight text-white">{website.name}</h1>
				<span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset {statusBg(website.status)}">
					<span class="h-1.5 w-1.5 rounded-full {statusColor(website.status)}"></span>
					{statusLabel(website.status)}
				</span>
			</div>
			<p class="mt-1 text-sm text-zinc-500">/{website.slug}</p>
		</div>

		<div class="flex items-center gap-2">
			<a
				href={baseUrl}
				target="_blank"
				rel="noopener noreferrer"
				class="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
				</svg>
				Open website
			</a>

			<a
				href="/websites/{website.id}/analytics"
				class="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
			>
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
				</svg>
				Analytics
			</a>

			{#if canEdit && website.status !== 'ARCHIVED'}
				<form method="POST" action="?/deploy" use:enhance={() => { deploying = true; return async ({ update }) => { await update(); deploying = false; }; }}>
					<button
						type="submit"
						disabled={deploying}
						class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/30 active:scale-[0.98] disabled:opacity-50"
					>
						{#if deploying}
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							Deploying...
						{:else}
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
							Redeploy
						{/if}
					</button>
				</form>
			{/if}

			{#if canArchive && website.status !== 'ARCHIVED'}
				<button
					type="button"
					onclick={() => (showArchiveDialog = true)}
					class="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:border-amber-600 hover:text-amber-400"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
					</svg>
					Archive
				</button>
			{/if}

			{#if canRelaunch && website.status === 'ARCHIVED'}
				<button
					type="button"
					onclick={() => (showRelaunchDialog = true)}
					class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/30 active:scale-[0.98]"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
					</svg>
					Relaunch
				</button>
			{/if}

			{#if canDelete && website.status === 'ARCHIVED'}
				<button
					type="button"
					onclick={() => (showDeleteDialog = true)}
					class="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-red-400 transition-colors hover:border-red-600 hover:bg-red-500/10"
				>
					<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
					</svg>
					Delete
				</button>
			{/if}
		</div>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
			{form.error}
		</div>
	{/if}

	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Public URL</span>
			<div class="mt-2 flex items-center gap-2">
				<a
					href={baseUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="min-w-0 truncate text-sm text-emerald-400 underline decoration-emerald-500/30 underline-offset-2 transition-colors hover:text-emerald-300"
				>
					{baseUrl}
				</a>
				<button
					type="button"
					onclick={copyUrl}
					class="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-300"
					title="Copy URL"
				>
					{#if copiedUrl}
						<svg class="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
					{:else}
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
						</svg>
					{/if}
				</button>
			</div>
		</div>

		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Git URL</span>
			<p class="mt-2 min-w-0 truncate text-sm text-zinc-300">{website.gitUrl}</p>
		</div>

		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Slug</span>
			<p class="mt-2 font-mono text-sm text-zinc-300">/{website.slug}</p>
		</div>

		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Created</span>
			<p class="mt-2 text-sm text-zinc-300">{formatDate(website.createdAt)}</p>
		</div>

		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Last deployed</span>
			<p class="mt-2 text-sm text-zinc-300">
				{#if latestDeployment()}
					{timeAgo(latestDeployment().createdAt)}
				{:else}
					<span class="text-zinc-600">Never</span>
				{/if}
			</p>
		</div>

		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
			<span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Storage</span>
			<p class="mt-2 text-sm text-zinc-300">{formatBytes(website.storageBytes)}</p>
		</div>

		{#if website.expiresAt}
			<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
				<span class="text-xs font-medium uppercase tracking-wider text-zinc-500">Expires</span>
				<p class="mt-2 text-sm text-zinc-300">{formatDate(website.expiresAt)}</p>
			</div>
		{/if}
	</div>

	<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<h2 class="text-lg font-semibold text-white">Analytics</h2>
				<p class="mt-1 text-sm text-zinc-500">
					Last 7 days &middot; no cookies and no personal data
				</p>
			</div>
			<a
				href="/websites/{website.id}/analytics"
				class="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3.5 py-2 text-xs font-medium text-zinc-300 transition-colors hover:border-emerald-600 hover:text-emerald-400"
			>
				Full report
				<svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
				</svg>
			</a>
		</div>

		<div class="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
			<div>
				<p class="text-xs font-medium uppercase tracking-wider text-zinc-500">Pageviews</p>
				<p class="mt-1.5 text-2xl font-bold tracking-tight text-white">
					{formatNumber(data.analytics.pageviews)}
				</p>
			</div>
			<div>
				<p class="text-xs font-medium uppercase tracking-wider text-zinc-500">Visitors</p>
				<p class="mt-1.5 text-2xl font-bold tracking-tight text-white">
					{formatNumber(data.analytics.visitors)}
				</p>
			</div>
			<div>
				<p class="text-xs font-medium uppercase tracking-wider text-zinc-500">Avg. engagement</p>
				<p class="mt-1.5 text-2xl font-bold tracking-tight text-white">
					{formatDuration(data.analytics.averageEngagementSeconds)}
				</p>
			</div>
			<div>
				<p class="text-xs font-medium uppercase tracking-wider text-zinc-500">Missing pages</p>
				<p class="mt-1.5 text-2xl font-bold tracking-tight {data.analytics.notFound > 0 ? 'text-amber-400' : 'text-white'}">
					{formatNumber(data.analytics.notFound)}
				</p>
			</div>
		</div>

		<div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
			<Sparkline series={data.analytics.series} width={240} height={48} />
			<p class="text-xs text-zinc-500">Pageviews, last 7 days</p>
		</div>
	</div>

	{#if data.deployments.length > 0}
		<div>
			<h2 class="text-lg font-semibold text-white mb-4">Deployment history</h2>
			<div class="space-y-2">
				{#each data.deployments as deployment, i (deployment.id)}
					<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-3">
								<span class="inline-flex h-6 w-6 items-center justify-center rounded-full
									{deployment.success ? 'bg-emerald-500/10' : 'bg-red-500/10'}">
									{#if deployment.success}
										<svg class="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
										</svg>
									{:else}
										<svg class="h-3.5 w-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
											<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
										</svg>
									{/if}
								</span>
								<div>
									<p class="text-sm font-medium text-zinc-200">
										{#if i === 0}Latest deployment{:else}Deployment {data.deployments.length - i}{/if}
									</p>
									<p class="text-xs text-zinc-500">{timeAgo(deployment.createdAt)}</p>
								</div>
							</div>

							{#if deployment.errorMessage}
								<span class="shrink-0 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
									Failed
								</span>
							{:else}
								<span class="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-400">
									Success
								</span>
							{/if}
						</div>

						{#if canViewLogs && deployment.log}
							<div class="mt-3">
								<button
									type="button"
									onclick={() => (logExpanded = logExpanded ? false : true)}
									class="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 transition-colors hover:text-zinc-300"
								>
									<svg class="h-3.5 w-3.5 transition-transform {logExpanded ? 'rotate-90' : ''}" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
										<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
									</svg>
									Build log
								</button>
								{#if logExpanded}
									<pre class="mt-2 max-h-60 overflow-auto rounded-lg bg-zinc-950 border border-zinc-800 p-3 text-xs text-zinc-400 font-mono whitespace-pre-wrap">{deployment.log}</pre>
								{/if}
							</div>
						{/if}

						{#if deployment.errorMessage}
							<p class="mt-2 text-xs text-red-400/80">{deployment.errorMessage}</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}

	{#if showArchiveDialog}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onclick={() => (showArchiveDialog = false)} role="dialog" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') showArchiveDialog = false; }}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div class="mx-4 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" onclick={(e) => e.stopPropagation()} role="document">
				<h3 class="text-lg font-semibold text-white">Archive website</h3>
				<p class="mt-2 text-sm text-zinc-400">
					This will take <strong class="text-zinc-200">{website.name}</strong> offline. You can relaunch it later.
				</p>
				<div class="mt-6 flex items-center justify-end gap-3">
					<button
						type="button"
						onclick={() => (showArchiveDialog = false)}
						class="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
					>
						Cancel
					</button>
					<form method="POST" action="?/archive" use:enhance={() => { archiving = true; return async ({ update }) => { await update(); archiving = false; }; }}>
						<button
							type="submit"
							disabled={archiving}
							class="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-amber-500 active:scale-[0.98] disabled:opacity-50"
						>
							{#if archiving}
								<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
								</svg>
								Archiving...
							{:else}
								Archive website
							{/if}
						</button>
					</form>
				</div>
			</div>
		</div>
	{/if}

	{#if showRelaunchDialog}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onclick={() => (showRelaunchDialog = false)} role="dialog" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') showRelaunchDialog = false; }}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div class="mx-4 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" onclick={(e) => e.stopPropagation()} role="document">
				<h3 class="text-lg font-semibold text-white">Relaunch website</h3>
				<p class="mt-2 text-sm text-zinc-400">
					Restore <strong class="text-zinc-200">{website.name}</strong> from its archived version and make it live again.
				</p>
				<form method="POST" action="?/relaunch" use:enhance={() => { relaunching = true; return async ({ update }) => { await update(); relaunching = false; }; }} class="mt-4 space-y-4">
					<div>
						<label for="relaunch-expiry" class="mb-1.5 block text-sm font-medium text-zinc-300">
							Expiry date <span class="text-zinc-500">(optional)</span>
						</label>
						<input
							id="relaunch-expiry"
							type="date"
							name="expiresAt"
							bind:value={relaunchExpiry}
							class="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
						/>
						<p class="mt-1.5 text-xs text-zinc-500">Leave blank for no expiry.</p>
					</div>
					<div class="flex items-center justify-end gap-3">
						<button
							type="button"
							onclick={() => (showRelaunchDialog = false)}
							class="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={relaunching}
							class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50"
						>
							{#if relaunching}
								<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
								</svg>
								Relaunching...
							{:else}
								Relaunch
							{/if}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if showDeleteDialog}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onclick={() => (showDeleteDialog = false)} role="dialog" tabindex="-1" onkeydown={(e) => { if (e.key === 'Escape') showDeleteDialog = false; }}>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div class="mx-4 w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl" onclick={(e) => e.stopPropagation()} role="document">
				<h3 class="text-lg font-semibold text-white">Delete website permanently</h3>
				<p class="mt-2 text-sm text-zinc-400">
					This will permanently delete <strong class="text-zinc-200">{website.name}</strong> and all its data. This action cannot be undone.
				</p>
				<div class="mt-6 flex items-center justify-end gap-3">
					<button
						type="button"
						onclick={() => (showDeleteDialog = false)}
						class="rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
					>
						Cancel
					</button>
					<form method="POST" action="?/delete" use:enhance={() => { deleting = true; return async ({ update }) => { await update(); deleting = false; }; }}>
						<button
							type="submit"
							disabled={deleting}
							class="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-red-500 active:scale-[0.98] disabled:opacity-50"
						>
							{#if deleting}
								<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
								</svg>
								Deleting...
							{:else}
								Delete permanently
							{/if}
						</button>
					</form>
				</div>
			</div>
		</div>
	{/if}
</div>

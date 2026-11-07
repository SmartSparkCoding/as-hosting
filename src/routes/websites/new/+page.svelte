<script lang="ts">
	import { enhance } from '$app/forms';
	import { PRODUCT_NAME } from '$lib/constants';
	import { normalizeSlug } from '$lib/utils';
	import type { SubmitFunction } from './$types';

	interface BulkItem {
		input: string;
		slug: string | null;
		name: string | null;
		status: string;
		message: string;
		websiteId?: string;
	}

	interface BulkResult {
		group: { name: string; slug: string } | null;
		deployed: number;
		failed: number;
		items: BulkItem[];
	}

	interface FormShape {
		success?: boolean;
		websiteId?: string;
		deployed?: boolean;
		error?: string;
		bulk?: BulkResult;
	}

	let { data, form }: { data: { groups: { name: string; slug: string }[]; maxBulk: number }; form: FormShape | null } =
		$props();

	let name = $state('');
	let gitUrl = $state('');
	let rawSlug = $state('');
	let slugTouched = $state(false);
	let submitting = $state(false);
	let submitted = $state(false);

	let mode = $state<'single' | 'bulk'>('single');
	let bulkRepos = $state('');
	let bulkGroup = $state('');
	let bulkVisibility = $state<'PUBLIC' | 'UNLISTED' | 'PASSWORD'>('PUBLIC');
	let bulkPassword = $state('');
	let bulkSubmitting = $state(false);

	const generatedSlug = $derived(normalizeSlug(name));
	const displaySlug = $derived(slugTouched ? normalizeSlug(rawSlug) : generatedSlug);

	const bulkCount = $derived(
		bulkRepos
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith('#')).length
	);

	$effect(() => {
		if (form?.success && form?.websiteId) {
			submitted = true;
		}
	});

	$effect(() => {
		if (form?.bulk) {
			mode = 'bulk';
			bulkSubmitting = false;
		}
	});

	const handleEnhance: SubmitFunction = () => {
		submitting = true;
		return async ({ update }) => {
			await update();
			submitting = false;
		};
	};

	const handleBulkEnhance: SubmitFunction = () => {
		bulkSubmitting = true;
		return async ({ update }) => {
			await update();
			bulkSubmitting = false;
		};
	};

	function statusTone(status: string): string {
		if (status === 'deployed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
		if (status === 'created') return 'border-amber-500/30 bg-amber-500/10 text-amber-400';
		if (status === 'skipped') return 'border-zinc-700 bg-zinc-800 text-zinc-400';
		return 'border-red-500/30 bg-red-500/10 text-red-400';
	}
</script>

<svelte:head>
	<title>Add website — {PRODUCT_NAME}</title>
</svelte:head>

<div class="mx-auto max-w-2xl space-y-6">
	<div>
		<a href="/websites" class="inline-flex items-center gap-1.5 text-sm text-zinc-500 transition-colors hover:text-zinc-300">
			<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
				<path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
			</svg>
			Back to websites
		</a>
		<h1 class="mt-4 text-2xl font-bold tracking-tight text-white">Add website</h1>
		<p class="mt-1 text-sm text-zinc-400">Deploy a static site from a Git repository.</p>
	</div>

	<div class="inline-flex rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
		<button
			type="button"
			onclick={() => (mode = 'single')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {mode === 'single' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}"
		>
			One site
		</button>
		<button
			type="button"
			onclick={() => (mode = 'bulk')}
			class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors {mode === 'bulk' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'}"
		>
			Bulk deploy
		</button>
	</div>

	{#if mode === 'single'}
		{#if form?.success}
			<div class="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-6 text-center">
				<div class="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20">
					<svg class="h-5 w-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
						<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
					</svg>
				</div>
				<h2 class="text-lg font-semibold text-white">
					{form.deployed ? 'Website is live!' : 'Website created'}
				</h2>
				<p class="mt-1 text-sm text-zinc-400">
					{#if form.deployed}
						Your website has been deployed successfully.
					{:else}
						The website was created but the deployment had issues. You can redeploy from the management page.
					{/if}
				</p>
				<div class="mt-4 flex items-center justify-center gap-3">
					<a
						href="/websites/{form.websiteId}"
						class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-emerald-500 active:scale-[0.98]"
					>
						Manage website
					</a>
					<a
						href="/websites/new"
						class="inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
					>
						Create another
					</a>
				</div>
			</div>
		{:else}
			<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
				<form method="POST" use:enhance={handleEnhance} class="space-y-5">
					<div>
						<label for="name" class="mb-1.5 block text-sm font-medium text-zinc-300">
							Website name
						</label>
						<input
							id="name"
							type="text"
							name="name"
							required
							placeholder="My awesome project"
							bind:value={name}
							class="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
						/>
					</div>

					<div>
						<label for="gitUrl" class="mb-1.5 block text-sm font-medium text-zinc-300">
							Git repository URL
						</label>
						<input
							id="gitUrl"
							type="url"
							name="gitUrl"
							required
							placeholder="https://github.com/username/repo"
							bind:value={gitUrl}
							class="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
						/>
						<p class="mt-1.5 text-xs text-zinc-500">Must be an HTTPS URL to a repository with an index.html.</p>
					</div>

					<div>
						<label for="slug" class="mb-1.5 block text-sm font-medium text-zinc-300">
							Project slug
						</label>
						<input
							id="slug"
							type="text"
							name="slug"
							placeholder={generatedSlug || 'my-awesome-project'}
							bind:value={rawSlug}
							onfocus={() => (slugTouched = true)}
							class="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
						/>
						{#if displaySlug}
							<p class="mt-1.5 text-xs text-zinc-500">
								Your site will be at <span class="font-mono text-emerald-400">/{displaySlug}/</span>
							</p>
						{/if}
					</div>

					{#if form?.error}
						<div class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
							{form.error}
						</div>
					{/if}

					<button
						type="submit"
						disabled={submitting || !name || !gitUrl}
						class="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/30 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if submitting}
							<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
							</svg>
							Deploying...
						{:else}
							<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
							</svg>
							Deploy website
						{/if}
					</button>
				</form>
			</div>

			<p class="text-xs text-zinc-600">
				The repository must contain a static site with an <code class="rounded bg-zinc-800 px-1 py-0.5 text-zinc-400">index.html</code> at the root.
			</p>
		{/if}
	{:else}
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
			<form method="POST" action="?/bulk" use:enhance={handleBulkEnhance} class="space-y-5">
				<div>
					<label for="repos" class="mb-1.5 block text-sm font-medium text-zinc-300">
						Repositories
					</label>
					<textarea
						id="repos"
						name="repos"
						rows="8"
						required
						placeholder={'https://github.com/club-member/first-site\nhttps://github.com/club-member/second-site\nhttps://github.com/club-member/third-site'}
						bind:value={bulkRepos}
						class="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 font-mono text-xs text-white placeholder-zinc-600 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
					></textarea>
					<p class="mt-1.5 text-xs text-zinc-500">
						One repository per line, up to {data.maxBulk}. Names and slugs come from the repository name.
						{#if bulkCount > 0}
							<span class="text-zinc-400">{bulkCount} queued.</span>
						{/if}
					</p>
				</div>

				<div>
					<label for="groupName" class="mb-1.5 block text-sm font-medium text-zinc-300">
						Section <span class="font-normal text-zinc-500">(optional)</span>
					</label>
					<input
						id="groupName"
						type="text"
						name="groupName"
						list="existing-groups"
						placeholder="Autumn workshop"
						bind:value={bulkGroup}
						class="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
					/>
					<datalist id="existing-groups">
						{#each data.groups as group (group.slug)}
							<option value={group.name}></option>
						{/each}
					</datalist>
					<p class="mt-1.5 text-xs text-zinc-500">
						Groups these sites together in the list, and gives them an index page at
						<span class="font-mono text-emerald-400">/{normalizeSlug(bulkGroup) || 'section-name'}</span>.
					</p>
				</div>

				<fieldset class="space-y-2">
					<legend class="mb-1.5 block text-sm font-medium text-zinc-300">Who can see these sites</legend>
					{#each [{ value: 'PUBLIC', label: 'Public', hint: 'Listed in search engines and club stats' }, { value: 'UNLISTED', label: 'Unlisted', hint: 'Works by link, hidden from search and stats' }, { value: 'PASSWORD', label: 'Password', hint: 'Asks for one shared password before serving anything' }] as option (option.value)}
						<label class="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 transition-colors hover:border-zinc-700">
							<input
								type="radio"
								name="visibility"
								value={option.value}
								checked={bulkVisibility === option.value}
								onchange={() => (bulkVisibility = option.value as 'PUBLIC' | 'UNLISTED' | 'PASSWORD')}
								class="mt-0.5 h-4 w-4 accent-emerald-500"
							/>
							<span>
								<span class="block text-sm font-medium text-zinc-200">{option.label}</span>
								<span class="block text-xs text-zinc-500">{option.hint}</span>
							</span>
						</label>
					{/each}
				</fieldset>

				{#if bulkVisibility === 'PASSWORD'}
					<div>
						<label for="bulkPassword" class="mb-1.5 block text-sm font-medium text-zinc-300">
							Shared password
						</label>
						<input
							id="bulkPassword"
							type="text"
							name="accessPassword"
							required
							minlength="6"
							placeholder="At least 6 characters"
							bind:value={bulkPassword}
							class="block w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
						/>
						<p class="mt-1.5 text-xs text-zinc-500">Hand this to the group. Everyone shares it.</p>
					</div>
				{:else}
					<input type="hidden" name="showInPublicStats" value="on" />
				{/if}

				{#if form?.error}
					<div class="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
						{form.error}
					</div>
				{/if}

				<button
					type="submit"
					disabled={bulkSubmitting || bulkCount === 0}
					class="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all hover:bg-emerald-500 hover:shadow-emerald-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if bulkSubmitting}
						<svg class="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
						</svg>
						Deploying {bulkCount} site{bulkCount === 1 ? '' : 's'}...
					{:else}
						<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
						</svg>
						Bulk deploy
					{/if}
				</button>
			</form>
		</div>

		{#if form?.bulk}
			{@const bulk = form.bulk}
			<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h2 class="text-lg font-semibold text-white">
							{bulk.deployed} of {bulk.items.length} live
						</h2>
						<p class="mt-1 text-sm text-zinc-400">
							{bulk.failed === 0
								? 'Every repository deployed.'
								: `${bulk.failed} need another look.`}
							{#if bulk.group}
								Grouped under {bulk.group.name}.
							{/if}
						</p>
					</div>
					<div class="flex items-center gap-2">
						{#if bulk.group}
							<a
								href="/{bulk.group.slug}"
								class="rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:text-white"
							>
								View section
							</a>
						{/if}
						<a
							href="/websites"
							class="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
						>
							All websites
						</a>
					</div>
				</div>

				<ul class="mt-4 divide-y divide-zinc-800 border-t border-zinc-800">
					{#each bulk.items as item (item.input)}
						<li class="flex flex-wrap items-center justify-between gap-2 py-3">
							<div class="min-w-0">
								{#if item.websiteId}
									<a href="/websites/{item.websiteId}" class="block truncate text-sm text-white hover:text-emerald-400">
										{item.name ?? item.slug}
									</a>
								{:else}
									<span class="block truncate text-sm text-zinc-300">{item.name ?? item.input}</span>
								{/if}
								<span class="block truncate font-mono text-xs text-zinc-500">
									{item.slug ? `/${item.slug}/` : item.input}
								</span>
							</div>
							<div class="flex items-center gap-2">
								{#if item.message}
									<span class="max-w-[16rem] truncate text-xs text-zinc-500" title={item.message}>{item.message}</span>
								{/if}
								<span class="rounded-full border px-2 py-0.5 text-xs font-medium {statusTone(item.status)}">
									{item.status}
								</span>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		<p class="text-xs text-zinc-600">
			Every repository needs a static site with an <code class="rounded bg-zinc-800 px-1 py-0.5 text-zinc-400">index.html</code> at the root.
			Sites deploy {data.maxBulk > 3 ? 'three at a time' : 'one at a time'}, so a big batch takes a minute.
		</p>
	{/if}
</div>

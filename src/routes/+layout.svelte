<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import favicon from '$lib/assets/favicon.svg';

	let { data, children } = $props();
	let mobileMenuOpen = $state(false);

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}

	let navLinks = $derived.by(() => {
		const links = [
			{ href: '/dashboard', label: 'Dashboard' },
			{ href: '/websites', label: 'Websites' }
		];

		if (data.user?.role === 'MAIN_LEADER') {
			links.push({ href: '/settings/people', label: 'People' });
		}

		links.push({ href: '/stats', label: 'Club stats' });

		links.push({ href: '/settings', label: 'Settings' });

		return links;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if data.user}
	<div class="min-h-screen bg-zinc-950 text-zinc-100">
		<nav class="sticky top-0 z-50 h-[60px] border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
			<div class="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
				<div class="flex items-center gap-8">
					<a href="/dashboard" class="text-lg font-bold tracking-tight text-white">
						AS Hosting
					</a>

					<div class="hidden items-center gap-1 md:flex">
						{#each navLinks as link}
							<a
								href={link.href}
								class="rounded-md px-3 py-1.5 text-sm font-medium transition-colors
									{($page.url.pathname === link.href || $page.url.pathname.startsWith(link.href + '/'))
										? 'text-emerald-400'
										: 'text-zinc-400 hover:text-zinc-100'}"
							>
								{link.label}
							</a>
						{/each}
					</div>
				</div>

				<div class="hidden items-center gap-4 md:flex">
					<span class="text-sm text-zinc-400">{data.user.name}</span>
					<form method="POST" action="/api/auth/logout">
						<button
							type="submit"
							class="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
						>
							Log out
						</button>
					</form>
				</div>

				<button
					type="button"
					class="inline-flex items-center justify-center rounded-md p-2 text-zinc-400 transition-colors hover:text-zinc-100 md:hidden"
					onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
					aria-label="Toggle menu"
				>
					{#if mobileMenuOpen}
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
						</svg>
					{:else}
						<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
							<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
						</svg>
					{/if}
				</button>
			</div>
		</nav>

		{#if mobileMenuOpen}
			<div class="border-b border-zinc-800 bg-zinc-900 md:hidden">
				<div class="space-y-1 px-4 py-3">
					{#each navLinks as link}
						<a
							href={link.href}
							onclick={closeMobileMenu}
							class="block rounded-md px-3 py-2 text-sm font-medium transition-colors
								{($page.url.pathname === link.href || $page.url.pathname.startsWith(link.href + '/'))
									? 'text-emerald-400'
									: 'text-zinc-400 hover:text-zinc-100'}"
						>
							{link.label}
						</a>
					{/each}

						<div class="border-t border-zinc-800 pt-3 mt-3">
						<div class="flex items-center justify-between px-3">
							<span class="text-sm text-zinc-400">{data.user.name}</span>
							<form method="POST" action="/api/auth/logout">
								<button
									type="submit"
									class="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
								>
									Log out
								</button>
							</form>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<main class="mx-auto max-w-6xl px-4 py-8">
			{@render children()}
		</main>

		<footer class="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-zinc-600">
			Hosted sites use cookie-free analytics.
			<a href="/privacy" class="underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-400">
				What that means
			</a>
		</footer>
	</div>
{:else}
	<div class="min-h-screen bg-zinc-950 text-zinc-100">
		<header class="sticky top-0 z-50 h-[60px] border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md">
			<div class="mx-auto flex h-full max-w-6xl items-center px-4">
				<a href="/" class="text-lg font-bold tracking-tight text-white">
					AS Hosting
				</a>
			</div>
		</header>

		<main>
			{@render children()}
		</main>

		<footer class="px-4 pb-8 text-center text-xs text-zinc-600">
			Hosted sites use cookie-free analytics.
			<a href="/privacy" class="underline decoration-zinc-700 underline-offset-2 transition-colors hover:text-zinc-400">
				What that means
			</a>
		</footer>
	</div>
{/if}

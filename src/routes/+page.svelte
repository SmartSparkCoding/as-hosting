<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Radius rule for this page: panels are rounded-2xl, buttons and links are rounded-lg.
	const number = (value: number) => value.toLocaleString('en-GB');

	const steps = [
		{
			title: 'Add your repository',
			body: 'Paste a public GitHub link on the new website page. One repository per site, or twenty in one go on workshop day.'
		},
		{
			title: 'We clone and serve it',
			body: 'The club box pulls the repository and serves the files straight from disk. Put an index.html at the root and you are done.'
		},
		{
			title: 'You get a link',
			body: 'Your site answers at /your-name/ with a checks score and a screenshot on the deploy, so you can see what shipped.'
		},
		{
			title: 'Push to update',
			body: 'Every push to the default branch redeploys automatically. Open a pull request and it gets its own preview link.'
		}
	];

	const pasteSample = [
		'github.com/your-name/portfolio',
		'github.com/your-name/robot-arm',
		'github.com/your-name/tiny-game'
	];
</script>

<div class="mx-auto max-w-6xl px-4">
	<section class="grid gap-12 pt-14 pb-20 md:grid-cols-[1.15fr_0.85fr] md:items-center md:pt-20">
		<div>
			<p class="font-mono text-[11px] tracking-[0.2em] text-emerald-400 uppercase">
				{data.clubName}
			</p>

			<h1 class="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
				Your site, live at <span class="text-emerald-400">/your-name/</span>
			</h1>

			<p class="mt-5 max-w-[54ch] text-base leading-relaxed text-zinc-400">
				Push a repository, get a link. No servers to run, no build step to babysit, no waiting on
				anyone.
			</p>

			<div class="mt-8 flex flex-wrap items-center gap-3">
				<a
					href="/login"
					class="rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition-transform hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:outline-none active:translate-y-px"
				>
					Log in
				</a>
				<a
					href="/stats"
					class="rounded-lg border border-zinc-700 px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:outline-none active:translate-y-px"
				>
					See what is live
				</a>
			</div>
		</div>

		<aside class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
			<div class="flex items-baseline justify-between gap-4">
				<h2 class="text-sm font-medium text-zinc-300">On the club box</h2>
				<span class="font-mono text-[11px] text-zinc-500">last 7 days</span>
			</div>

			{#if data.stats}
				<dl class="mt-6 grid grid-cols-3 gap-4">
					<div>
						<dt class="text-xs text-zinc-500">Pageviews</dt>
						<dd class="mt-1 text-2xl font-semibold tracking-tight text-white">
							{number(data.stats.week.pageviews)}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-zinc-500">Sites with traffic</dt>
						<dd class="mt-1 text-2xl font-semibold tracking-tight text-white">
							{number(data.stats.activeSites)}
						</dd>
					</div>
					<div>
						<dt class="text-xs text-zinc-500">Listed sites</dt>
						<dd class="mt-1 text-2xl font-semibold tracking-tight text-white">
							{number(data.stats.sites.length)}
						</dd>
					</div>
				</dl>

				{#if data.stats.sites.length}
					<ul class="mt-6 space-y-1 border-t border-zinc-800 pt-4">
						{#each data.stats.sites.slice(0, 4) as site (site.id)}
							<li>
								<a
									href="/{site.slug}/"
									class="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-800/60 hover:text-white"
								>
									<span class="truncate">{site.name}</span>
									<span class="font-mono text-xs text-zinc-500">/{site.slug}/</span>
								</a>
							</li>
						{/each}
					</ul>
				{:else}
					<p class="mt-6 border-t border-zinc-800 pt-4 text-sm text-zinc-500">
						Nothing is listed yet. The first site up here could be yours.
					</p>
				{/if}
			{:else}
				<p class="mt-6 text-sm text-zinc-500">
					The numbers are not answering right now, but the hosting still works.
				</p>
			{/if}
		</aside>
	</section>

	<section class="grid gap-10 border-t border-zinc-800 py-20 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
		<h2 class="text-2xl font-semibold tracking-tight text-white md:text-3xl">
			Four steps, then it is live
		</h2>

		<ol class="divide-y divide-zinc-800">
			{#each steps as step}
				<li class="py-5 first:pt-0 last:pb-0">
					<h3 class="text-base font-medium text-white">{step.title}</h3>
					<p class="mt-2 max-w-[62ch] text-sm leading-relaxed text-zinc-400">{step.body}</p>
				</li>
			{/each}
		</ol>
	</section>

	<section class="border-t border-zinc-800 py-20">
		<h2 class="text-2xl font-semibold tracking-tight text-white md:text-3xl">
			What you get with it
		</h2>

		<div class="mt-10 grid gap-4 md:grid-cols-3">
			<div
				class="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.07] p-6 md:col-span-2"
			>
				<h3 class="text-base font-medium text-white">Sections for every workshop</h3>
				<p class="mt-3 max-w-[62ch] text-sm leading-relaxed text-zinc-300">
					Paste a list of repositories and they all deploy in one batch, grouped under a section
					you can hand out as one link. Visiting /the-section/ shows every site in it.
				</p>
				<p
					class="mt-6 border-t border-emerald-500/20 pt-4 font-mono text-xs text-emerald-300/80"
				>
					/winter-workshop/ lists the whole section
				</p>
			</div>

			<div class="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
				<h3 class="text-base font-medium text-white">Public, unlisted or locked</h3>
				<ul class="mt-3 space-y-2 text-sm leading-relaxed text-zinc-400">
					<li>Public, so search engines and club stats can find it.</li>
					<li>Unlisted, so only people with the link get in.</li>
					<li>Locked behind one password you can change anytime.</li>
				</ul>
			</div>

			<div class="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
				<h3 class="text-base font-medium text-white">Deploys you can undo</h3>
				<p class="mt-3 text-sm leading-relaxed text-zinc-400">
					Every deploy keeps its own copy, so a bad push is one click from being rolled back to the
					release that worked.
				</p>
			</div>

			<div class="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 md:col-span-2">
				<h3 class="text-base font-medium text-white">
					Analytics that do not follow people around
				</h3>
				<p class="mt-3 max-w-[62ch] text-sm leading-relaxed text-zinc-400">
					Pageviews, referrers, countries and screen sizes, with no cookies and no personal data
					kept. Read exactly what is collected on the <a
						href="/privacy"
						class="text-emerald-400 underline decoration-emerald-500/40 underline-offset-2 hover:decoration-emerald-400"
						>privacy page</a
					>.
				</p>
			</div>
		</div>
	</section>

	<section class="grid gap-10 border-t border-zinc-800 py-20 md:grid-cols-2 md:items-center">
		<div>
			<h2 class="text-2xl font-semibold tracking-tight text-white md:text-3xl">
				Built for a room full of laptops
			</h2>
			<p class="mt-4 max-w-[56ch] text-sm leading-relaxed text-zinc-400">
				On workshop day nobody wants to fill in twenty forms. Paste the repositories, name the
				section, pick how visible they should be, and press go. Slugs come from the repository
				names, and each line reports back on its own if something went wrong.
			</p>
			<p class="mt-4 max-w-[56ch] text-sm leading-relaxed text-zinc-400">
				The whole batch can then be made public, unlisted or password protected in one action from
				the websites list.
			</p>
		</div>

		<div class="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6">
			<p class="font-mono text-[11px] tracking-[0.16em] text-zinc-500 uppercase">
				Repositories, one per line
			</p>
			<pre class="mt-4 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-300">{pasteSample.join(
					'\n'
				)}</pre>
			<p class="mt-4 border-t border-zinc-800 pt-4 text-xs text-zinc-500">
				Up to 25 per batch, three at a time, so the box stays responsive.
			</p>
		</div>
	</section>

	<section class="border-t border-zinc-800 py-20">
		<div class="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
			<h2 class="max-w-[36ch] text-2xl font-semibold tracking-tight text-white md:text-3xl">
				Log in with your club account and ship something today.
			</h2>
			<a
				href="/login"
				class="shrink-0 rounded-lg bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-transform hover:bg-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/60 focus-visible:outline-none active:translate-y-px"
			>
				Log in
			</a>
		</div>
	</section>
</div>

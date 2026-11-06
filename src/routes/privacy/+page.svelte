<script lang="ts">
	import { PRODUCT_NAME } from '$lib/constants';
</script>

<svelte:head>
	<title>Analytics privacy — {PRODUCT_NAME}</title>
	<meta name="robots" content="index, follow" />
</svelte:head>

<div class="mx-auto max-w-3xl px-4 py-12">
	<p class="text-xs font-medium uppercase tracking-wider text-emerald-400">Privacy</p>
	<h1 class="mt-2 text-3xl font-bold tracking-tight text-white">Analytics on hosted sites</h1>
	<p class="mt-3 text-sm text-zinc-400">
		{PRODUCT_NAME} counts visits to club websites so their owners know what is being used.
		It is built to need no cookie banner, no consent pop-up and no personal data.
	</p>

	<div class="mt-10 space-y-10 text-sm leading-relaxed text-zinc-400">
		<section>
			<h2 class="text-base font-semibold text-zinc-100">What is recorded</h2>
			<ul class="mt-3 list-disc space-y-1.5 pl-5">
				<li>The page path that was opened, for example <span class="font-mono text-zinc-300">/about</span>.</li>
				<li>The time of the visit and an approximate session length.</li>
				<li>The referring website's hostname, never the full referring URL.</li>
				<li>A coarse device type (desktop, mobile or tablet), browser name and major version, and operating system.</li>
				<li>The country the request came from, when the network provides it, and the browser's preferred language.</li>
				<li>Campaign tags (<span class="font-mono text-zinc-300">utm_source</span>, <span class="font-mono text-zinc-300">utm_medium</span>, <span class="font-mono text-zinc-300">utm_campaign</span>) when a link includes them.</li>
				<li>Whether a page was scrolled, how long it was visible and which external host an outbound link pointed at, when the page's analytics script runs.</li>
			</ul>
		</section>

		<section>
			<h2 class="text-base font-semibold text-zinc-100">What is never recorded</h2>
			<ul class="mt-3 list-disc space-y-1.5 pl-5">
				<li>Cookies, local storage, or anything installed in a visitor's browser.</li>
				<li>IP addresses, full user-agent strings, or any other raw request data.</li>
				<li>Names, accounts, email addresses or anything that identifies a person.</li>
				<li>Full URLs, search terms, or any profiling across sites.</li>
				<li>Anything on pages that do not belong to this hosting service.</li>
			</ul>
		</section>

		<section>
			<h2 class="text-base font-semibold text-zinc-100">How unique visitors are counted</h2>
			<p class="mt-3">
				To tell one visitor from another on the same day, the server hashes the visitor's IP
				address and browser string together with a random key. That key exists only in memory
				and is thrown away at midnight (UK time), so the resulting value cannot be reversed and
				hashes from different days cannot be linked. Only the first 16 characters of the hash
				are stored, and the original IP address and browser string are never written anywhere.
			</p>
		</section>

		<section>
			<h2 class="text-base font-semibold text-zinc-100">Opting out</h2>
			<p class="mt-3">
				If your browser sends <span class="font-mono text-zinc-300">DNT: 1</span> or
				<span class="font-mono text-zinc-300">Sec-GPC: 1</span>, nothing is recorded at all.
				Visits from automated tools, link previews and prefetches are ignored.
				Blocking the analytics script stops the richer measurements (scroll depth, outbound
				clicks); the basic view count is still taken from the server request, because it
				contains no personal data.
			</p>
		</section>

		<section>
			<h2 class="text-base font-semibold text-zinc-100">Retention and access</h2>
			<p class="mt-3">
				Analytics rows are deleted after 90 days by default. Only signed-in leaders of
				{PRODUCT_NAME} can see a site's statistics, and they can only see sites they are
				allowed to manage. The data is used for one purpose: helping club members understand
				which pages are useful.
			</p>
		</section>

		<section>
			<h2 class="text-base font-semibold text-zinc-100">Legal basis</h2>
			<p class="mt-3">
				Nothing is stored on the visitor's device and no personal data is collected, so no
				cookie consent banner is involved. Measurement is limited to aggregate statistics
				about page usage rather than individuals, and is carried out under the club's
				legitimate interest in running and improving its own websites. No data is sold or
				shared with advertisers.
			</p>
		</section>

		<section class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
			<h2 class="text-base font-semibold text-zinc-100">Questions</h2>
			<p class="mt-2">
				Ask a club leader in the Ashford School Hack Club Slack workspace, or open an issue on
				the hosting project's repository.
			</p>
			<a href="/" class="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-400 hover:text-emerald-300">
				Back to {PRODUCT_NAME}
				<svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
				</svg>
			</a>
		</section>
	</div>
</div>

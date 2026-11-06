<script lang="ts">
	let {
		label,
		value,
		hint = '',
		accent = false
	}: { label: string; value: string | number; hint?: string; accent?: boolean } = $props();
</script>

<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
	<p class="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
	<p class="mt-2 text-2xl font-bold tracking-tight {accent ? 'text-emerald-400' : 'text-white'}">
		{value}
	</p>
	{#if hint}
		<p class="mt-1 text-xs text-zinc-500">{hint}</p>
	{/if}
</div>

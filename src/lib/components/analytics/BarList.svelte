<script lang="ts">
	interface Item {
		label: string;
		value: number;
	}

	let {
		items,
		emptyLabel = 'Nothing recorded yet',
		formatValue = (value: number) => value.toLocaleString('en-GB'),
		barClass = 'bg-emerald-400/70'
	}: {
		items: Item[];
		emptyLabel?: string;
		formatValue?: (value: number) => string;
		barClass?: string;
	} = $props();

	const maxValue = $derived(Math.max(1, ...items.map((item) => item.value)));
</script>

{#if items.length === 0}
	<p class="py-3 text-sm text-zinc-500">{emptyLabel}</p>
{:else}
	<ul class="space-y-2.5">
		{#each items as item (item.label)}
			<li>
				<div class="flex items-baseline justify-between gap-3">
					<span class="min-w-0 truncate text-sm text-zinc-300" title={item.label}>{item.label}</span>
					<span class="shrink-0 text-xs font-medium tabular-nums text-zinc-400">
						{formatValue(item.value)}
					</span>
				</div>
				<div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
					<div
						class="h-full rounded-full {barClass}"
						style={`width: ${Math.max(2, (item.value / maxValue) * 100)}%`}
					></div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

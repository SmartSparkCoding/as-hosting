<script lang="ts">
	interface Cell {
		dow: number;
		hour: number;
		pageviews: number;
	}

	let { cells, timezone = 'Europe/London' }: { cells: Cell[]; timezone?: string } = $props();

	// Postgres `dow` is 0 = Sunday. Show Monday first, like a UK calendar.
	const dayOrder = [1, 2, 3, 4, 5, 6, 0];
	const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
	const hours = Array.from({ length: 24 }, (_, hour) => hour);

	const byKey = $derived(
		new Map(cells.map((cell) => [`${cell.dow}-${cell.hour}`, cell.pageviews]))
	);
	const maxValue = $derived(Math.max(1, ...cells.map((cell) => cell.pageviews)));
	const hasData = $derived(cells.some((cell) => cell.pageviews > 0));

	function valueFor(dayIndex: number, hour: number): number {
		return byKey.get(`${dayOrder[dayIndex]}-${hour}`) ?? 0;
	}

	function alpha(value: number): number {
		if (value === 0) return 0;
		return 0.12 + (value / maxValue) * 0.88;
	}

	function formatHour(hour: number): string {
		return `${String(hour).padStart(2, '0')}:00`;
	}
</script>

<div>
	{#if !hasData}
		<p class="py-3 text-sm text-zinc-500">No visits recorded in this period.</p>
	{:else}
		<div class="overflow-x-auto">
			<div class="min-w-[520px]">
				<div class="flex">
					<div class="w-9 shrink-0"></div>
					<div class="grid flex-1 grid-cols-24 gap-[3px]">
						{#each hours as hour}
							<span class="text-center text-[9px] text-zinc-600">
								{hour % 3 === 0 ? hour : ''}
							</span>
						{/each}
					</div>
				</div>

				{#each dayLabels as label, dayIndex}
					<div class="mt-[3px] flex items-center">
						<span class="w-9 shrink-0 text-[10px] text-zinc-500">{label}</span>
						<div class="grid flex-1 grid-cols-24 gap-[3px]">
							{#each hours as hour}
								{@const value = valueFor(dayIndex, hour)}
								<div
									class="aspect-square rounded-[3px] ring-1 ring-inset ring-white/5"
									style={`background-color: rgba(52, 211, 153, ${alpha(value)})`}
									title={`${label} ${formatHour(hour)}: ${value} view${value === 1 ? '' : 's'}`}
								></div>
							{/each}
						</div>
					</div>
				{/each}

				<div class="mt-3 flex items-center justify-between text-[10px] text-zinc-500">
					<span>All times are {timezone.replace('_', ' ')}</span>
					<span class="flex items-center gap-1.5">
						Less
						<span class="h-2.5 w-2.5 rounded-[3px] bg-emerald-400/10 ring-1 ring-inset ring-white/5"></span>
						<span class="h-2.5 w-2.5 rounded-[3px] bg-emerald-400/40 ring-1 ring-inset ring-white/5"></span>
						<span class="h-2.5 w-2.5 rounded-[3px] bg-emerald-400/70 ring-1 ring-inset ring-white/5"></span>
						<span class="h-2.5 w-2.5 rounded-[3px] bg-emerald-400 ring-1 ring-inset ring-white/5"></span>
						More
					</span>
				</div>
			</div>
		</div>
	{/if}
</div>

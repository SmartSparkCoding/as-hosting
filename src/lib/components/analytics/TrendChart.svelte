<script lang="ts">
	interface Point {
		day: string;
		pageviews: number;
		visitors: number;
	}

	let { series, height = 260 }: { series: Point[]; height?: number } = $props();

	let width = $state(900);
	let hovered = $state<number | null>(null);

	const padding = { top: 16, right: 16, bottom: 28, left: 40 };
	const innerWidth = $derived(Math.max(10, width - padding.left - padding.right));
	const innerHeight = $derived(Math.max(10, height - padding.top - padding.bottom));
	const maxValue = $derived(
		Math.max(1, ...series.map((point) => Math.max(point.pageviews, point.visitors)))
	);
	const stepX = $derived(
		series.length > 1 ? innerWidth / (series.length - 1) : innerWidth
	);

	function x(index: number): number {
		if (series.length <= 1) return padding.left + innerWidth / 2;
		return padding.left + index * stepX;
	}

	function y(value: number): number {
		return padding.top + innerHeight - (value / maxValue) * innerHeight;
	}

	function linePath(key: 'pageviews' | 'visitors'): string {
		return series
			.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(index).toFixed(1)},${y(point[key]).toFixed(1)}`)
			.join(' ');
	}

	const viewLine = $derived(linePath('pageviews'));
	const visitorLine = $derived(linePath('visitors'));
	const areaPath = $derived(
		`${viewLine} L${x(series.length - 1).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} L${x(0).toFixed(1)},${(padding.top + innerHeight).toFixed(1)} Z`
	);

	const gridLines = $derived(
		[0, 0.25, 0.5, 0.75, 1].map((fraction) => ({
			value: Math.round(maxValue * fraction),
			y: y(maxValue * fraction)
		}))
	);

	const xTicks = $derived.by(() => {
		if (series.length === 0) return [];
		const indexes = new Set<number>();
		const count = Math.min(4, series.length);
		for (let i = 0; i < count; i += 1) {
			indexes.add(Math.round((i * (series.length - 1)) / Math.max(1, count - 1)));
		}
		return [...indexes].sort((a, b) => a - b);
	});

	function shortDate(day: string): string {
		return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short'
		});
	}

	function handleMove(event: PointerEvent): void {
		if (series.length === 0) return;
		const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
		const relative = event.clientX - rect.left;
		const index = Math.round(relative / (stepX || 1));
		hovered = Math.max(0, Math.min(series.length - 1, index));
	}

	const hoveredPoint = $derived(hovered === null ? null : series[hovered]);
	const tooltipLeft = $derived(
		hovered === null ? 0 : Math.min(Math.max(x(hovered), 78), Math.max(78, width - 78))
	);
</script>

<div class="relative w-full" bind:clientWidth={width}>
	<svg
		width={width}
		height={height}
		viewBox={`0 0 ${width} ${height}`}
		role="img"
		aria-label="Pageviews and unique visitors over time"
	>
		{#each gridLines as line}
			<line
				x1={padding.left}
				x2={width - padding.right}
				y1={line.y}
				y2={line.y}
				stroke="currentColor"
				class="text-zinc-800"
				stroke-width="1"
				stroke-dasharray={line.value === 0 ? '0' : '3 5'}
			/>
			<text
				x={padding.left - 8}
				y={line.y + 3}
				text-anchor="end"
				class="fill-zinc-500 text-[10px]"
			>
				{line.value}
			</text>
		{/each}

		{#each xTicks as index}
			<text
				x={x(index)}
				y={height - 8}
				text-anchor={index === 0 ? 'start' : index === series.length - 1 ? 'end' : 'middle'}
				class="fill-zinc-500 text-[10px]"
			>
				{shortDate(series[index].day)}
			</text>
		{/each}

		<defs>
			<linearGradient id="analytics-area" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0%" stop-color="#34d399" stop-opacity="0.28" />
				<stop offset="100%" stop-color="#34d399" stop-opacity="0" />
			</linearGradient>
		</defs>

		<path d={areaPath} fill="url(#analytics-area)" />
		<path
			d={visitorLine}
			fill="none"
			stroke="#38bdf8"
			stroke-width="1.75"
			stroke-linejoin="round"
			stroke-linecap="round"
			stroke-dasharray="4 4"
		/>
		<path
			d={viewLine}
			fill="none"
			stroke="#34d399"
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>

		{#if hovered !== null && hoveredPoint}
			<line
				x1={x(hovered)}
				x2={x(hovered)}
				y1={padding.top}
				y2={padding.top + innerHeight}
				stroke="currentColor"
				class="text-zinc-600"
				stroke-width="1"
			/>
			<circle cx={x(hovered)} cy={y(hoveredPoint.pageviews)} r="3.5" fill="#34d399" />
			<circle cx={x(hovered)} cy={y(hoveredPoint.visitors)} r="3" fill="#38bdf8" />
		{/if}

		<rect
			x={padding.left}
			y={padding.top}
			width={innerWidth}
			height={innerHeight}
			fill="transparent"
			role="presentation"
			aria-hidden="true"
			onpointermove={handleMove}
			onpointerleave={() => (hovered = null)}
		/>
	</svg>

	{#if hovered !== null && hoveredPoint}
		<div
			class="pointer-events-none absolute top-2 z-10 w-36 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 text-xs shadow-xl"
			style={`left: ${tooltipLeft}px`}
		>
			<p class="font-medium text-zinc-200">{shortDate(hoveredPoint.day)}</p>
			<p class="mt-1 flex items-center justify-between gap-3 text-zinc-400">
				<span class="flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>Views
				</span>
				<span class="font-medium text-zinc-100">{hoveredPoint.pageviews}</span>
			</p>
			<p class="mt-0.5 flex items-center justify-between gap-3 text-zinc-400">
				<span class="flex items-center gap-1.5">
					<span class="h-1.5 w-1.5 rounded-full bg-sky-400"></span>Visitors
				</span>
				<span class="font-medium text-zinc-100">{hoveredPoint.visitors}</span>
			</p>
		</div>
	{/if}
</div>

<script lang="ts">
	interface Point {
		day: string;
		pageviews: number;
	}

	let {
		series,
		width = 180,
		height = 48,
		color = '#34d399'
	}: { series: Point[]; width?: number; height?: number; color?: string } = $props();

	const padding = 3;
	const maxValue = $derived(Math.max(1, ...series.map((point) => point.pageviews)));
	const stepX = $derived(
		series.length > 1 ? (width - padding * 2) / (series.length - 1) : 0
	);

	const points = $derived(
		series.map((point, index) => {
			const x = padding + index * stepX;
			const y = height - padding - (point.pageviews / maxValue) * (height - padding * 2);
			return `${x.toFixed(1)},${y.toFixed(1)}`;
		})
	);

	const line = $derived(points.length ? `M${points.join(' L')}` : '');
	const area = $derived(
		points.length
			? `${line} L${(width - padding).toFixed(1)},${height - padding} L${padding},${height - padding} Z`
			: ''
	);

	const gradientId = $derived(`spark-${Math.random().toString(36).slice(2, 8)}`);
</script>

<svg
	{width}
	{height}
	viewBox={`0 0 ${width} ${height}`}
	role="img"
	aria-label="Trend sparkline"
	class="overflow-visible"
>
	<defs>
		<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
			<stop offset="0%" {color} stop-opacity="0.25" />
			<stop offset="100%" {color} stop-opacity="0" />
		</linearGradient>
	</defs>
	{#if line}
		<path d={area} fill={`url(#${gradientId})`} />
		<path
			d={line}
			fill="none"
			{color}
			stroke-width="1.75"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	{/if}
</svg>

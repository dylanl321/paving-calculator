<script lang="ts">
	import { onMount } from 'svelte';

	interface AnalyticsData {
		requests_total: number;
		requests_cached: number;
		error_count_4xx: number;
		error_count_5xx: number;
		bandwidth_bytes: number;
		bandwidth_cached_bytes: number;
		period: string;
		cached_at: string;
	}

	type Period = '1h' | '6h' | '24h' | '7d' | '30d';

	let period = $state<Period>('24h');
	let data = $state<AnalyticsData | null>(null);
	let loading = $state(true);
	let error = $state('');

	const periodLabels: Record<Period, string> = {
		'1h': '1 Hour',
		'6h': '6 Hours',
		'24h': '24 Hours',
		'7d': '7 Days',
		'30d': '30 Days'
	};

	onMount(async () => {
		await loadAnalytics();
	});

	async function loadAnalytics() {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/admin/cf-analytics?period=${period}`);
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load analytics data';
				loading = false;
				return;
			}
			data = (await res.json()) as AnalyticsData;
		} catch {
			error = 'Failed to load analytics data';
		} finally {
			loading = false;
		}
	}

	async function changePeriod(newPeriod: Period) {
		period = newPeriod;
		await loadAnalytics();
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
		return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
	}

	function formatPercent(value: number): string {
		return `${value.toFixed(1)}%`;
	}

	const cacheHitRatio = $derived.by(() => {
		if (!data || data.requests_total === 0) return 0;
		return (data.requests_cached / data.requests_total) * 100;
	});

	const errorRate = $derived.by(() => {
		if (!data || data.requests_total === 0) return 0;
		const totalErrors = data.error_count_4xx + data.error_count_5xx;
		return (totalErrors / data.requests_total) * 100;
	});

	// Status code breakdown for donut chart
	const statusBreakdown = $derived.by(() => {
		if (!data) return [];
		const total4xx = data.error_count_4xx;
		const total5xx = data.error_count_5xx;
		const total2xx = data.requests_total - total4xx - total5xx;

		return [
			{ label: '2xx Success', count: total2xx, color: '#4ade80' },
			{ label: '4xx Client Error', count: total4xx, color: '#facc15' },
			{ label: '5xx Server Error', count: total5xx, color: '#f87171' }
		].filter((s) => s.count > 0);
	});

	// Generate donut chart path
	function generateDonutPaths(breakdown: { label: string; count: number; color: string }[]) {
		if (breakdown.length === 0) return [];
		const total = breakdown.reduce((sum, s) => sum + s.count, 0);
		if (total === 0) return [];

		let cumulativeAngle = 0;
		const cx = 100;
		const cy = 100;
		const radius = 80;
		const innerRadius = 50;

		return breakdown.map((segment) => {
			const startAngle = cumulativeAngle;
			const fraction = segment.count / total;
			const endAngle = startAngle + fraction * 2 * Math.PI;
			cumulativeAngle = endAngle;

			// Outer arc
			const x1 = cx + radius * Math.cos(startAngle - Math.PI / 2);
			const y1 = cy + radius * Math.sin(startAngle - Math.PI / 2);
			const x2 = cx + radius * Math.cos(endAngle - Math.PI / 2);
			const y2 = cy + radius * Math.sin(endAngle - Math.PI / 2);

			// Inner arc
			const x3 = cx + innerRadius * Math.cos(endAngle - Math.PI / 2);
			const y3 = cy + innerRadius * Math.sin(endAngle - Math.PI / 2);
			const x4 = cx + innerRadius * Math.cos(startAngle - Math.PI / 2);
			const y4 = cy + innerRadius * Math.sin(startAngle - Math.PI / 2);

			const largeArc = fraction > 0.5 ? 1 : 0;

			const pathData = [
				`M ${x1} ${y1}`,
				`A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
				`L ${x3} ${y3}`,
				`A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4}`,
				`Z`
			].join(' ');

			return {
				path: pathData,
				color: segment.color,
				label: segment.label,
				percent: formatPercent((segment.count / total) * 100)
			};
		});
	}

	const donutPaths = $derived(generateDonutPaths(statusBreakdown));
</script>

<div class="analytics-page">
	<header class="admin-page-header">
		<div>
			<h1 class="admin-page-title">Analytics</h1>
			<p class="admin-page-subtitle">Cloudflare platform metrics and request analytics.</p>
		</div>
	</header>

	<!-- Period selector -->
	<div class="period-selector">
		{#each Object.entries(periodLabels) as [key, label]}
			<button
				class="period-btn"
				class:active={period === key}
				onclick={() => changePeriod(key as Period)}
				disabled={loading}
			>
				{label}
			</button>
		{/each}
	</div>

	{#if error}
		<div class="error-msg">{error}</div>
	{:else if loading}
		<!-- Loading skeleton -->
		<div class="skeleton-grid">
			<div class="skeleton-card"></div>
			<div class="skeleton-card"></div>
			<div class="skeleton-card"></div>
			<div class="skeleton-card"></div>
		</div>
		<div class="skeleton-charts">
			<div class="skeleton-chart"></div>
			<div class="skeleton-chart"></div>
			<div class="skeleton-chart"></div>
		</div>
	{:else if data}
		<!-- Stat cards -->
		<div class="stat-grid">
			<div class="stat-card">
				<div class="stat-header">
					<span class="stat-label">Total Requests</span>
				</div>
				<div class="stat-value">{data.requests_total.toLocaleString()}</div>
				<div class="stat-footer">
					<span class="stat-period">{periodLabels[period]}</span>
				</div>
			</div>

			<div class="stat-card">
				<div class="stat-header">
					<span class="stat-label">Cache Hit Ratio</span>
				</div>
				<div class="stat-value">{formatPercent(cacheHitRatio)}</div>
				<div class="stat-footer">
					<span class="stat-detail"
						>{data.requests_cached.toLocaleString()} / {data.requests_total.toLocaleString()}</span
					>
				</div>
			</div>

			<div class="stat-card">
				<div class="stat-header">
					<span class="stat-label">Error Rate</span>
				</div>
				<div class="stat-value" class:stat-warning={errorRate > 5}>
					{formatPercent(errorRate)}
				</div>
				<div class="stat-footer">
					<span class="stat-detail"
						>{(data.error_count_4xx + data.error_count_5xx).toLocaleString()} errors</span
					>
				</div>
			</div>

			<div class="stat-card">
				<div class="stat-header">
					<span class="stat-label">Bandwidth</span>
				</div>
				<div class="stat-value">{formatBytes(data.bandwidth_bytes)}</div>
				<div class="stat-footer">
					<span class="stat-detail">{formatBytes(data.bandwidth_cached_bytes)} cached</span>
				</div>
			</div>
		</div>

		<!-- Charts -->
		<div class="charts-grid">
			<!-- Requests visualization -->
			<div class="chart-card">
				<h3 class="chart-title">Requests</h3>
				<div class="chart-content">
					<svg class="bar-chart" viewBox="0 0 300 200" aria-label="Requests bar chart">
						<rect x="80" y="40" width="140" height="140" fill="var(--accent)" rx="4" />
						<text x="150" y="100" text-anchor="middle" fill="var(--accent-text)" class="chart-label">
							{data.requests_total.toLocaleString()}
						</text>
						<text x="150" y="120" text-anchor="middle" fill="var(--accent-text)" class="chart-sublabel">
							total requests
						</text>
					</svg>
				</div>
			</div>

			<!-- Status code donut -->
			<div class="chart-card">
				<h3 class="chart-title">Status Codes</h3>
				<div class="chart-content">
					{#if donutPaths.length > 0}
						<svg class="donut-chart" viewBox="0 0 200 200" aria-label="Status code breakdown">
							{#each donutPaths as segment}
								<path d={segment.path} fill={segment.color} />
							{/each}
						</svg>
						<div class="chart-legend">
							{#each donutPaths as segment, i}
								<div class="legend-item">
									<span class="legend-color" style="background: {segment.color}"></span>
									<span class="legend-label">{segment.label}</span>
									<span class="legend-value">{segment.percent}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="chart-empty">No data available</div>
					{/if}
				</div>
			</div>

			<!-- Top paths notice -->
			<div class="chart-card">
				<h3 class="chart-title">Top Paths</h3>
				<div class="chart-content">
					<div class="chart-notice">
						<div class="notice-icon">🔒</div>
						<p class="notice-text">Path-level analytics require Cloudflare Enterprise</p>
					</div>
				</div>
			</div>
		</div>

		{#if data.cached_at}
			<div class="data-footer">
				<span class="data-timestamp"
					>Data cached at: {new Date(data.cached_at).toLocaleString()}</span
				>
			</div>
		{/if}
	{/if}
</div>

<style>
	.analytics-page {
		width: 100%;
	}

	/* Period selector */
	.period-selector {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
	}

	.period-btn {
		min-height: 48px;
		padding: 0 1.25rem;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background-color 0.15s,
			color 0.15s,
			border-color 0.15s;
	}

	.period-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
	}

	.period-btn.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.period-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Stat cards */
	.stat-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		padding: 1.5rem;
	}

	.stat-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stat-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.stat-value {
		font-size: 2.25rem;
		font-weight: 700;
		color: var(--accent);
		line-height: 1;
	}

	.stat-value.stat-warning {
		color: #facc15;
	}

	.stat-footer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.stat-period,
	.stat-detail {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	/* Charts */
	.charts-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.chart-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
	}

	.chart-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		margin: 0 0 1rem 0;
	}

	.chart-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		min-height: 240px;
	}

	/* Bar chart */
	.bar-chart {
		width: 100%;
		max-width: 300px;
		height: auto;
	}

	.chart-label {
		font-size: 1.5rem;
		font-weight: 700;
	}

	.chart-sublabel {
		font-size: 0.9rem;
		font-weight: 500;
	}

	/* Donut chart */
	.donut-chart {
		width: 100%;
		max-width: 200px;
		height: auto;
	}

	.chart-legend {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.85rem;
	}

	.legend-color {
		width: 16px;
		height: 16px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.legend-label {
		flex: 1;
		color: var(--text);
	}

	.legend-value {
		font-weight: 600;
		color: var(--accent);
	}

	.chart-empty {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	/* Chart notice */
	.chart-notice {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		text-align: center;
		padding: 2rem;
	}

	.notice-icon {
		font-size: 2.5rem;
		opacity: 0.6;
	}

	.notice-text {
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0;
		max-width: 240px;
	}

	/* Loading skeleton */
	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.skeleton-card {
		height: 140px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		animation: pulse 1.5s ease-in-out infinite;
	}

	.skeleton-charts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.skeleton-chart {
		height: 300px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.6;
		}
	}

	/* Data footer */
	.data-footer {
		text-align: center;
		padding: 1rem;
		border-top: 1px solid var(--border);
	}

	.data-timestamp {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	/* Error message */
	.error-msg {
		padding: 2rem;
		text-align: center;
		border-radius: var(--radius, 0.5rem);
		border: 1px solid rgba(239, 68, 68, 0.3);
		color: #f87171;
		background: rgba(239, 68, 68, 0.08);
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.stat-grid,
		.charts-grid,
		.skeleton-grid,
		.skeleton-charts {
			grid-template-columns: 1fr;
		}

		.period-selector {
			flex-direction: column;
		}

		.period-btn {
			width: 100%;
		}
	}
</style>

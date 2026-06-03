<script lang="ts">
	import { onMount } from 'svelte';
	import { BarChart } from 'layerchart';
	import ChartMount from '$lib/components/charts/ChartMount.svelte';
	import { formatFeet } from '$lib/utils/format';

	interface Props {
		jobSiteId: string;
		initialDate?: string;
		onClose: () => void;
	}

	let { jobSiteId, initialDate, onClose }: Props = $props();

	type PeriodType = 'week' | 'month';

	let periodType = $state<PeriodType>('week');
	let currentDate = $state(initialDate || new Date().toISOString().split('T')[0]);
	let loading = $state(true);
	let data = $state<any>(null);
	let siteName = $state('Job Site');
	let generatingPDF = $state(false);

	onMount(() => {
		loadData();
	});

	$effect(() => {
		void periodType;
		void currentDate;
		loadData();
	});

	async function loadData() {
		loading = true;
		try {
			const [rollupRes, siteRes] = await Promise.all([
				fetch(`/api/job-sites/${jobSiteId}/logs/rollup?period=${periodType}&date=${currentDate}`),
				fetch(`/api/job-sites/${jobSiteId}`)
			]);
			if (rollupRes.ok) {
				data = await rollupRes.json();
			}
			if (siteRes.ok) {
				const siteData = await siteRes.json();
				siteName = siteData.name || 'Job Site';
			}
		} finally {
			loading = false;
		}
	}

	async function exportPDF() {
		if (!data || generatingPDF) return;
		generatingPDF = true;
		try {
			const { generateWeeklyMonthlyPDF } = await import('$lib/utils/pdf-export');
			const { jobState } = await import('$lib/stores/job.svelte');
			await generateWeeklyMonthlyPDF(
				{
					periodType,
					period: data.period,
					bounds: data.bounds,
					days: data.days,
					totals: data.totals
				},
				siteName,
				undefined,
				jobState
			);
		} finally {
			generatingPDF = false;
		}
	}

	async function exportCSV() {
		if (!data) return;
		const { exportRollupCSV } = await import('$lib/utils/csv-export');
		exportRollupCSV({
			period: data.period,
			periodType,
			siteName,
			data
		});
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	function goNext() {
		const date = new Date(currentDate + 'T00:00:00');
		if (periodType === 'week') {
			date.setDate(date.getDate() + 7);
		} else {
			date.setMonth(date.getMonth() + 1);
		}
		currentDate = date.toISOString().split('T')[0];
	}

	function goPrev() {
		const date = new Date(currentDate + 'T00:00:00');
		if (periodType === 'week') {
			date.setDate(date.getDate() - 7);
		} else {
			date.setMonth(date.getMonth() - 1);
		}
		currentDate = date.toISOString().split('T')[0];
	}

	const chartData = $derived.by(() => {
		if (!data || !data.days) return [];
		return data.days.map((d: any) => {
			const [year, month, day] = d.date.split('-');
			return {
				...d,
				dateLabel: `${parseInt(month)}/${parseInt(day)}`
			};
		});
	});

	const isEmpty = $derived(chartData.length === 0 || chartData.every((d: any) => d.tons === 0));

	const barChartProps = $derived({
		data: chartData,
		x: 'dateLabel',
		y: 'tons',
		xAxisLabel: periodType === 'week' ? 'Day' : 'Week',
		yAxisLabel: 'Tons',
		padding: { left: 52, bottom: 32, top: 8, right: 8 }
	});

	const trendPct = $derived.by(() => {
		if (!data || !data.totals || !data.prev_period_tons || data.prev_period_tons === 0) return null;
		return ((data.totals.tons - data.prev_period_tons) / data.prev_period_tons) * 100;
	});

	function fmtTons(t: number): string {
		return t.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleBackdrop} role="dialog" aria-modal="true" aria-label="Weekly and Monthly Reports">
	<div class="sheet">
		<!-- Header -->
		<div class="sheet-header">
			<div class="header-info">
				<h2 class="sheet-title">Production Reports</h2>
				<div class="period-tabs">
					<button
						class="tab"
						class:active={periodType === 'week'}
						onclick={() => (periodType = 'week')}
					>
						Weekly
					</button>
					<button
						class="tab"
						class:active={periodType === 'month'}
						onclick={() => (periodType = 'month')}
					>
						Monthly
					</button>
				</div>
			</div>
			<button class="close-btn" onclick={onClose} aria-label="Close">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>

		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading report…</p>
			</div>
		{:else if data}
			<div class="sheet-body">
				<!-- Period Navigation -->
				<div class="period-nav">
					<button class="nav-btn" onclick={goPrev} aria-label="Previous period">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="15 18 9 12 15 6"></polyline>
						</svg>
					</button>
					<h3 class="period-label">{data.period}</h3>
					<button class="nav-btn" onclick={goNext} aria-label="Next period">
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<polyline points="9 18 15 12 9 6"></polyline>
						</svg>
					</button>
				</div>

				<!-- Summary Stats -->
				<section class="section">
					<div class="totals-grid">
						<div class="total-card">
							<span class="total-label">Total Tons</span>
							<span class="total-value">{fmtTons(data.totals.tons)}</span>
							{#if trendPct !== null}
								<span class="trend" class:trend-up={trendPct > 0} class:trend-down={trendPct < 0}>
									{#if trendPct > 0}↑{:else}↓{/if}
									{Math.abs(trendPct).toFixed(1)}% vs prev
								</span>
							{/if}
						</div>
						<div class="total-card">
							<span class="total-label">Total Loads</span>
							<span class="total-value">{data.totals.loads}</span>
						</div>
						<div class="total-card">
							<span class="total-label">Total Distance</span>
							<span class="total-value">{formatFeet(data.totals.distance_ft)}</span>
						</div>
						<div class="total-card">
							<span class="total-label">Days Worked</span>
							<span class="total-value">{data.totals.days_worked}</span>
						</div>
						<div class="total-card">
							<span class="total-label">Avg Tons/Day</span>
							<span class="total-value">{fmtTons(data.totals.avg_tons_per_day)}</span>
						</div>
					</div>
				</section>

				<!-- Production Chart -->
				<section class="section">
					<h3 class="section-title">Production by {periodType === 'week' ? 'Day' : 'Week'}</h3>
					<div class="chart">
						{#if isEmpty}
							<p class="empty">No production data for this period.</p>
						{:else}
							<ChartMount>
								<BarChart {...barChartProps} />
							</ChartMount>
						{/if}
					</div>
				</section>
			</div>

			<!-- Footer -->
			<div class="sheet-footer">
				<button class="btn-print" onclick={() => window.print()}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="6 9 6 2 18 2 18 9"></polyline>
						<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2 2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
						<rect x="6" y="14" width="12" height="8"></rect>
					</svg>
					Print
				</button>
				<button class="btn-pdf" onclick={exportPDF} disabled={generatingPDF}>
					{#if generatingPDF}
						<div class="mini-spinner"></div>
					{:else}
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
						</svg>
					{/if}
					PDF
				</button>
				<button class="btn-secondary" onclick={exportCSV}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
						<polyline points="7 10 12 15 17 10"></polyline>
						<line x1="12" y1="15" x2="12" y2="3"></line>
					</svg>
					CSV
				</button>
				<button class="btn-close" onclick={onClose}>Close</button>
			</div>
		{/if}
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 1000;
		display: flex;
		align-items: flex-end;
	}

	.sheet {
		background: var(--bg);
		border-radius: 20px 20px 0 0;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.sheet-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 20px 20px 16px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.header-info {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.sheet-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
		color: var(--text);
	}

	.period-tabs {
		display: flex;
		gap: 8px;
	}

	.tab {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
		padding: 6px 16px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.tab.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.close-btn {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 50%;
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text);
		flex-shrink: 0;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 60px 20px;
		color: var(--text-muted);
	}

	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.sheet-body {
		overflow-y: auto;
		flex: 1;
		padding: 0 0 8px;
	}

	/* Period Navigation */
	.period-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.nav-btn {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 50%;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text);
		transition: background 0.2s;
	}

	.nav-btn:hover {
		background: var(--bg);
	}

	.period-label {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0;
		color: var(--text);
	}

	/* Sections */
	.section {
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}

	.section:last-of-type {
		border-bottom: none;
	}

	.section-title {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		margin: 0 0 12px;
	}

	/* Totals */
	.totals-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	@media (min-width: 480px) {
		.totals-grid {
			grid-template-columns: 1fr 1fr 1fr;
		}
	}

	.total-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.total-label {
		font-size: 0.72rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.total-value {
		font-size: 1.4rem;
		font-weight: 700;
		color: var(--accent);
		line-height: 1.2;
	}

	.trend {
		font-size: 0.7rem;
		font-weight: 600;
		margin-top: 4px;
	}

	.trend-up {
		color: #22c55e;
	}

	.trend-down {
		color: #ef4444;
	}

	/* Chart */
	.chart {
		height: 280px;
		width: 100%;
		position: relative;
		--color-primary: var(--accent);
	}

	.empty {
		color: var(--text-muted);
		font-size: 0.85rem;
		text-align: center;
		padding: 120px 12px;
		margin: 0;
	}

	.chart :global(text) {
		fill: var(--text-muted);
		font-size: 0.7rem;
	}

	.chart :global(.tick line),
	.chart :global(path.domain) {
		stroke: var(--border);
	}

	/* Footer */
	.sheet-footer {
		padding: 12px 20px;
		border-top: 1px solid var(--border);
		display: flex;
		gap: 10px;
		flex-shrink: 0;
		background: var(--bg);
	}

	.btn-print,
	.btn-secondary {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0 16px;
		height: 48px;
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-pdf {
		display: flex;
		align-items: center;
		gap: 6px;
		background: var(--accent);
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		color: var(--accent-text);
		font-size: 0.9rem;
		font-weight: 600;
		padding: 0 16px;
		height: 48px;
		cursor: pointer;
		white-space: nowrap;
	}

	.btn-pdf:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.mini-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.btn-close {
		flex: 1;
		height: 48px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-print:hover,
	.btn-secondary:hover,
	.btn-close:hover {
		background: var(--surface);
	}

	.btn-pdf:hover:not(:disabled) {
		opacity: 0.9;
	}
</style>

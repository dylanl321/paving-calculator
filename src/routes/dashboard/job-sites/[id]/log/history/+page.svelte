<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import type { PageData } from './$types';
	import DailySummaryReport from '$lib/components/DailySummaryReport.svelte';
	import WeeklyMonthlyReport from '$lib/components/WeeklyMonthlyReport.svelte';
	import ProductionLineChart from '$lib/components/charts/ProductionLineChart.svelte';

	let { data }: { data: PageData } = $props();
	let summaryLog = $state<any>(null);
	let showReports = $state(false);

	// Build chart data from logs, sorted by date ascending
	const chartData = $derived(
		[...data.logs]
			.sort((a, b) => a.log_date.localeCompare(b.log_date))
			.map((log) => ({
				date: log.log_date,
				tons: log.summary?.total_tons ?? 0
			}))
	);

	// Calculate total tons across all days
	const totalTons = $derived(
		data.logs.reduce((sum, log) => sum + (log.summary?.total_tons ?? 0), 0)
	);

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function formatDistance(ft: number): string {
		if (ft >= 5280) {
			return `${(ft / 5280).toFixed(2)} mi`;
		}
		return `${ft.toLocaleString()} ft`;
	}

	function getWeatherIcon(condition: string | null): string {
		const icons: Record<string, string> = {
			clear: '☀️',
			cloudy: '☁️',
			rain: '🌧️',
			wind: '💨',
			fog: '🌫️'
		};
		return condition ? icons[condition] || '—' : '—';
	}

	function viewLog(logId: string) {
		goto(`/dashboard/job-sites/${data.jobSite.id}/log?date=${logId}`);
	}

	function openSummary(log: any) {
		summaryLog = log;
	}
</script>

<svelte:head>
	<title>Log History — {data.jobSite.name} — {config.app.name}</title>
</svelte:head>

<div class="dashboard">
	<div class="breadcrumb">
		<a href="/dashboard">Dashboard</a>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<a href="/dashboard/job-sites/{data.jobSite.id}">{data.jobSite.name}</a>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<a href="/dashboard/job-sites/{data.jobSite.id}/log">Daily Log</a>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<span>History</span>
	</div>

	<div class="page-header">
		<div>
			<h2 class="page-title">Log History</h2>
			<p class="page-subtitle">{data.logs.length} day{data.logs.length === 1 ? '' : 's'} logged</p>
		</div>
		<div class="header-actions">
			<button class="btn-primary" onclick={() => (showReports = true)}>
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
					<line x1="3" y1="9" x2="21" y2="9"></line>
					<line x1="9" y1="21" x2="9" y2="9"></line>
				</svg>
				Reports
			</button>
			<a href="/dashboard/job-sites/{data.jobSite.id}/log" class="btn-secondary">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="15 18 9 12 15 6"></polyline>
				</svg>
				Back to Today
			</a>
		</div>
	</div>

	{#if data.logs.length === 0}
		<div class="empty-state">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
				<line x1="16" y1="2" x2="16" y2="6"></line>
				<line x1="8" y1="2" x2="8" y2="6"></line>
				<line x1="3" y1="10" x2="21" y2="10"></line>
			</svg>
			<h4>No logs yet</h4>
			<p>Start logging daily production to see history here</p>
			<a href="/dashboard/job-sites/{data.jobSite.id}/log" class="btn-primary" style="margin-top: 16px;">
				Start Today's Log
			</a>
		</div>
	{:else}
		<div class="chart-section">
			<div class="section-header">
				<h3>Production Over Time</h3>
				<p class="section-subtitle">
					{totalTons.toFixed(1)} tons across {data.logs.length} day{data.logs.length === 1 ? '' : 's'}
				</p>
			</div>
			<ProductionLineChart data={chartData} />
		</div>

		<div class="log-list">
			{#each data.logs as log}
				<div class="log-card">
					<div class="log-header">
						<div>
							<h4 class="log-date">{formatDate(log.log_date)}</h4>
							<div class="log-weather">
								{#if log.weather_conditions}
									<span>{getWeatherIcon(log.weather_conditions)}</span>
								{/if}
								{#if log.weather_temp_f}
									<span>{log.weather_temp_f}°F</span>
								{/if}
								{#if log.crew_count}
									<span>👷 {log.crew_count}</span>
								{/if}
							</div>
						</div>
						{#if log.start_time && log.end_time}
							<div class="log-time">
								{log.start_time} – {log.end_time}
							</div>
						{/if}
					</div>

					{#if log.summary}
						<div class="log-summary">
							{#if log.summary.total_distance_ft > 0}
								<div class="summary-stat-compact">
									<span class="stat-label">Distance</span>
									<span class="stat-value">{formatDistance(log.summary.total_distance_ft)}</span>
								</div>
							{/if}
							{#if log.summary.total_tons > 0}
								<div class="summary-stat-compact">
									<span class="stat-label">Tons</span>
									<span class="stat-value">{log.summary.total_tons.toFixed(1)}</span>
								</div>
							{/if}
							{#if log.summary.total_loads > 0}
								<div class="summary-stat-compact">
									<span class="stat-label">Loads</span>
									<span class="stat-value">{log.summary.total_loads}</span>
								</div>
							{/if}
							{#if log.summary.hours_worked > 0}
								<div class="summary-stat-compact">
									<span class="stat-label">Hours</span>
									<span class="stat-value">{log.summary.hours_worked.toFixed(1)}</span>
								</div>
							{/if}
						</div>
					{/if}

					{#if log.notes}
						<div class="log-notes">{log.notes}</div>
					{/if}

					<div class="log-actions">
						<button class="btn-primary" onclick={() => openSummary(log)}>View Summary</button>
						<button class="btn-secondary" onclick={() => viewLog(log.id)}>Open Log</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if summaryLog}
	<DailySummaryReport
		jobSiteId={data.jobSite.id}
		log={summaryLog}
		onClose={() => (summaryLog = null)}
	/>
{/if}

{#if showReports}
	<WeeklyMonthlyReport
		jobSiteId={data.jobSite.id}
		onClose={() => (showReports = false)}
	/>
{/if}

<style>
	.dashboard {
		width: 100%;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 16px;
	}

	.breadcrumb a {
		color: var(--text-muted);
		transition: color 0.2s;
	}

	.breadcrumb a:hover {
		color: var(--accent);
	}

	.breadcrumb svg {
		width: 14px;
		height: 14px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 24px;
	}

	.header-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 4px;
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 20px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	.btn-secondary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 20px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-secondary:hover {
		background: var(--surface-alt);
	}

	.empty-state {
		text-align: center;
		padding: 48px 20px;
		color: var(--text-muted);
	}

	.empty-state svg {
		opacity: 0.5;
		margin-bottom: 16px;
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}

	.chart-section {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 24px;
	}

	.section-header {
		margin-bottom: 16px;
	}

	.section-header h3 {
		margin: 0 0 4px;
		font-size: 1.2rem;
	}

	.section-subtitle {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.log-list {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.log-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
	}

	.log-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 16px;
	}

	.log-date {
		margin: 0 0 6px;
		font-size: 1.2rem;
	}

	.log-weather {
		display: flex;
		gap: 12px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.log-time {
		font-size: 0.85rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.log-summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: 16px;
		padding: 16px;
		background: var(--surface-alt);
		border-radius: calc(var(--radius) - 4px);
		margin-bottom: 16px;
	}

	.summary-stat-compact {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.stat-value {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent);
	}

	.log-notes {
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
		margin-bottom: 16px;
		padding: 12px;
		background: var(--surface-alt);
		border-radius: calc(var(--radius) - 4px);
	}

	.log-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
	}

	.btn-primary {
		min-height: 48px;
		padding: 0 16px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	.btn-secondary {
		min-height: 48px;
		padding: 0 16px;
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-secondary:hover {
		background: var(--bg);
	}
</style>

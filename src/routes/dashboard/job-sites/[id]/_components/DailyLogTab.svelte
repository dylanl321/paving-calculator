<script lang="ts">
	import { onMount } from 'svelte';
	import { formatStation } from '$lib/services/gpsStation';

	let { jobSiteId }: { jobSiteId: string } = $props();

	interface LogEntry {
		id: string;
		entry_type: string;
		station_start: number | null;
		station_end: number | null;
		tons_placed: number | null;
	}

	interface LogSummary {
		total_tons: number;
		total_loads: number;
		hours_worked: number;
	}

	interface DailyLog {
		id: string;
		log_date: string;
		weather_temp_f: number | null;
		weather_conditions: 'clear' | 'cloudy' | 'rain' | 'wind' | 'fog' | null;
		crew_count: number | null;
		start_time: string | null;
		end_time: string | null;
		summary?: LogSummary;
		stationFrom?: number | null;
		stationTo?: number | null;
	}

	let logs = $state<DailyLog[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function getWeatherIcon(condition: string | null): string {
		const icons: Record<string, string> = {
			clear: '\u2600\uFE0F',
			cloudy: '\u2601\uFE0F',
			rain: '\uD83C\uDF27\uFE0F',
			wind: '\uD83D\uDCA8',
			fog: '\uD83C\uDF2B\uFE0F'
		};
		return condition ? (icons[condition] ?? '') : '';
	}

	onMount(async () => {
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/logs?limit=5`);
			if (!res.ok) {
				error = 'Failed to load logs';
				return;
			}
			const { logs: rawLogs } = (await res.json()) as { logs: DailyLog[] };

			// Fetch detail (summary + entries) for each log in parallel
			const detailed = await Promise.all(
				rawLogs.map(async (log): Promise<DailyLog> => {
					try {
						const detailRes = await fetch(`/api/job-sites/${jobSiteId}/logs/${log.id}`);
						if (!detailRes.ok) return log;
						const { summary, entries } = (await detailRes.json()) as {
							summary: LogSummary;
							entries: LogEntry[];
						};
						// Find station range from paving entries
						const pavingEntries = entries.filter(
							(e) => e.entry_type === 'paving' && (e.station_start != null || e.station_end != null)
						);
						let stationFrom: number | null = null;
						let stationTo: number | null = null;
						if (pavingEntries.length > 0) {
							const starts = pavingEntries
								.map((e) => e.station_start)
								.filter((v): v is number => v != null);
							const ends = pavingEntries
								.map((e) => e.station_end)
								.filter((v): v is number => v != null);
							if (starts.length > 0) stationFrom = Math.min(...starts);
							if (ends.length > 0) stationTo = Math.max(...ends);
						}
						return { ...log, summary, stationFrom, stationTo };
					} catch {
						return log;
					}
				})
			);

			logs = detailed;
		} catch {
			error = 'Failed to load logs';
		} finally {
			loading = false;
		}
	});
</script>

<section class="section daily-log-layout">
	<div class="daily-log-main">
		{#if loading}
			<div class="loading-state">
				<span class="spinner"></span>
				<span>Loading recent logs&hellip;</span>
			</div>
		{:else if error}
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
					<circle cx="12" cy="12" r="10"></circle>
					<line x1="12" y1="8" x2="12" y2="12"></line>
					<line x1="12" y1="16" x2="12.01" y2="16"></line>
				</svg>
				<h4>Could not load logs</h4>
				<p>{error}</p>
			</div>
		{:else if logs.length === 0}
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
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="16" y1="13" x2="8" y2="13"></line>
					<line x1="16" y1="17" x2="8" y2="17"></line>
					<polyline points="10 9 9 9 8 9"></polyline>
				</svg>
				<h4>No logs yet</h4>
				<p>Start logging daily production and entries will appear here.</p>
				<a class="btn btn-ghost" href="/dashboard/job-sites/{jobSiteId}/log">Open today's log</a>
			</div>
		{:else}
			<div class="log-list">
				{#each logs as log}
					<a
						class="log-entry"
						href="/dashboard/job-sites/{jobSiteId}/log?date={log.id}"
						aria-label="Open log for {formatDate(log.log_date)}"
					>
						<div class="log-entry-header">
							<span class="log-date">{formatDate(log.log_date)}</span>
							{#if log.weather_conditions || log.weather_temp_f}
								<span class="log-weather">
									{#if log.weather_conditions}
										<span class="weather-icon">{getWeatherIcon(log.weather_conditions)}</span>
									{/if}
									{#if log.weather_temp_f}
										<span class="weather-temp">{log.weather_temp_f}&deg;F</span>
									{/if}
								</span>
							{/if}
						</div>
						<div class="log-entry-stats">
							{#if log.summary && log.summary.total_tons > 0}
								<div class="stat">
									<span class="stat-label">Tons</span>
									<span class="stat-value">{log.summary.total_tons.toFixed(1)}</span>
								</div>
							{/if}
							{#if log.stationFrom != null || log.stationTo != null}
								<div class="stat">
									<span class="stat-label">Stations</span>
									<span class="stat-value station-range">
										{#if log.stationFrom != null}
											{formatStation(log.stationFrom)}
										{:else}
											&mdash;
										{/if}
										&rarr;
										{#if log.stationTo != null}
											{formatStation(log.stationTo)}
										{:else}
											&mdash;
										{/if}
									</span>
								</div>
							{/if}
							{#if log.weather_conditions && !log.weather_temp_f}
								<div class="stat">
									<span class="stat-label">Conditions</span>
									<span class="stat-value">{log.weather_conditions}</span>
								</div>
							{/if}
						</div>
					</a>
				{/each}
			</div>
			<div class="view-all-wrap">
				<a class="btn btn-ghost btn-view-all" href="/dashboard/job-sites/{jobSiteId}/log/history">
					View full history
				</a>
			</div>
		{/if}
	</div>
	<div class="daily-log-sidebar">
		<div class="log-form-panel">
			<h4>Daily Production Log</h4>
			<p>Track tonnage, stations, conditions, and crew for each work day.</p>
			<div class="log-cta">
				<a class="btn-primary" href="/dashboard/job-sites/{jobSiteId}/log">Open today's log</a>
			</div>
		</div>
	</div>
</section>

<style>
	.daily-log-layout {
		display: block;
	}

	.daily-log-main {
		width: 100%;
	}

	.daily-log-sidebar {
		display: none;
	}

	@media (min-width: 1024px) {
		.daily-log-layout {
			display: grid;
			grid-template-columns: 3fr 2fr;
			gap: 20px;
		}

		.daily-log-sidebar {
			display: block;
		}
	}

	/* Loading */
	.loading-state {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 32px 16px;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.spinner {
		display: inline-block;
		width: 20px;
		height: 20px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Empty / error state */
	.empty-state {
		text-align: center;
		padding: 40px 20px;
		color: var(--text-muted);
	}

	.empty-state svg {
		opacity: 0.4;
		margin-bottom: 14px;
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1rem;
		color: var(--text);
	}

	.empty-state p {
		margin: 0 0 16px;
		font-size: 0.88rem;
	}

	/* Log list */
	.log-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.log-entry {
		display: block;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 14px 16px;
		text-decoration: none;
		color: var(--text);
		min-height: 48px;
		transition:
			border-color 0.15s,
			background 0.15s;
	}

	.log-entry:hover {
		border-color: var(--accent);
		background: var(--surface-alt);
	}

	.log-entry-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 8px;
	}

	.log-date {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.log-weather {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.weather-icon {
		font-size: 1rem;
		line-height: 1;
	}

	.weather-temp {
		font-size: 0.85rem;
	}

	.log-entry-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 16px;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.stat-value {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
	}

	.station-range {
		font-family: var(--font-mono, monospace);
		font-size: 0.85rem;
	}

	/* View all */
	.view-all-wrap {
		margin-top: 12px;
		display: flex;
		justify-content: center;
	}

	.btn-view-all {
		font-size: 0.88rem;
		min-height: 40px;
		padding: 0 16px;
	}

	/* Sidebar panel */
	.log-form-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
	}

	.log-form-panel h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		font-weight: 700;
	}

	.log-form-panel p {
		margin: 0 0 16px;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.log-cta {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-top: 20px;
		flex-wrap: wrap;
	}

	@media (min-width: 1024px) {
		.log-cta {
			justify-content: flex-start;
		}
	}

	.log-cta a {
		text-decoration: none;
	}

	/* Shared button styles */
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 20px;
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		transition: opacity 0.15s;
	}

	.btn-ghost {
		background: transparent;
		color: var(--accent);
		border: 1px solid var(--border);
	}

	.btn-ghost:hover {
		background: var(--surface-alt);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
		text-decoration: none;
		transition: opacity 0.2s;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}
</style>

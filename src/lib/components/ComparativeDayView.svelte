<script lang="ts">
	import { formatFeet } from '$lib/utils/format';

	interface Props {
		jobSiteId: string;
		currentLogDate: string;
		isLogClosed?: boolean;
	}

	let { jobSiteId, currentLogDate, isLogClosed = false }: Props = $props();

	interface DaySummary {
		label: string;
		sublabel: string;
		log_date: string | null;
		total_tons: number;
		total_distance_ft: number;
		total_loads: number;
		crew_count: number | null;
		hours_worked: number;
		hasData: boolean;
	}

	let loading = $state(true);
	let error = $state<string | null>(null);
	let todaySummary = $state<DaySummary | null>(null);
	let yesterdaySummary = $state<DaySummary | null>(null);
	let bestDaySummary = $state<DaySummary | null>(null);

	function formatDate(dateStr: string): string {
		const [y, m, d] = dateStr.split('-').map(Number);
		const date = new Date(y, m - 1, d);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function formatTons(tons: number): string {
		if (tons === 0) return '0 T';
		return `${tons.toFixed(1)} T`;
	}

	function getPrevDay(dateStr: string): string {
		const [y, m, d] = dateStr.split('-').map(Number);
		const date = new Date(y, m - 1, d);
		date.setDate(date.getDate() - 1);
		return date.toISOString().split('T')[0];
	}

	async function fetchLogSummary(logId: string): Promise<{
		summary: { total_distance_ft: number; total_tons: number; total_loads: number; hours_worked: number };
	}> {
		const res = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}`);
		if (!res.ok) throw new Error('Failed to fetch log detail');
		return res.json();
	}

	async function loadData() {
		loading = true;
		error = null;
		try {
			const logsRes = await fetch(`/api/job-sites/${jobSiteId}/logs?limit=100`);
			if (!logsRes.ok) throw new Error('Failed to fetch logs');
			const { logs } = (await logsRes.json()) as { logs: { id: string; log_date: string; crew_count?: number | null }[] };

			const yesterdayDate = getPrevDay(currentLogDate);

			// Find relevant logs
			const todayLog = logs.find((l: any) => l.log_date === currentLogDate) ?? null;
			const yesterdayLog = logs.find((l: any) => l.log_date === yesterdayDate) ?? null;

			// Fetch summaries in parallel for today + yesterday
			const fetchPromises: Promise<any>[] = [];
			if (todayLog) fetchPromises.push(fetchLogSummary(todayLog.id).catch(() => null));
			else fetchPromises.push(Promise.resolve(null));
			if (yesterdayLog) fetchPromises.push(fetchLogSummary(yesterdayLog.id).catch(() => null));
			else fetchPromises.push(Promise.resolve(null));

			const [todayData, yesterdayData] = await Promise.all(fetchPromises);

			// Build today summary
			if (todayLog && todayData) {
				const s = todayData.summary ?? {};
				todaySummary = {
					label: 'Today',
					sublabel: formatDate(currentLogDate),
					log_date: currentLogDate,
					total_tons: s.total_tons ?? 0,
					total_distance_ft: s.total_distance_ft ?? 0,
					total_loads: s.total_loads ?? 0,
					crew_count: todayLog.crew_count ?? null,
					hours_worked: s.hours_worked ?? 0,
					hasData: true
				};
			} else {
				todaySummary = {
					label: 'Today',
					sublabel: formatDate(currentLogDate),
					log_date: currentLogDate,
					total_tons: 0,
					total_distance_ft: 0,
					total_loads: 0,
					crew_count: null,
					hours_worked: 0,
					hasData: false
				};
			}

			// Build yesterday summary
			if (yesterdayLog && yesterdayData) {
				const s = yesterdayData.summary ?? {};
				yesterdaySummary = {
					label: 'Yesterday',
					sublabel: formatDate(yesterdayDate),
					log_date: yesterdayDate,
					total_tons: s.total_tons ?? 0,
					total_distance_ft: s.total_distance_ft ?? 0,
					total_loads: s.total_loads ?? 0,
					crew_count: yesterdayLog.crew_count ?? null,
					hours_worked: s.hours_worked ?? 0,
					hasData: true
				};
			} else {
				yesterdaySummary = {
					label: 'Yesterday',
					sublabel: formatDate(yesterdayDate),
					log_date: yesterdayDate,
					total_tons: 0,
					total_distance_ft: 0,
					total_loads: 0,
					crew_count: null,
					hours_worked: 0,
					hasData: false
				};
			}

			// Find best day (by tons) - fetch summaries for all logs
			// Use logs already available, pick the one with the highest tons from the
			// summary data we can get without fetching all. We need to fetch all to find best.
			// To avoid too many requests, use a batch approach: fetch top candidates.
			// Sort logs by log_date desc and fetch up to 30 to find the best.
			const candidateLogs = logs.slice(0, 30);
			const summaryResults = await Promise.all(
				candidateLogs.map((l: any) =>
					fetchLogSummary(l.id)
						.then((d: any) => ({ log: l, summary: d?.summary ?? null }))
						.catch(() => ({ log: l, summary: null }))
				)
			);

			let bestLog: any = null;
			let bestSummaryData: any = null;
			let bestTons = -1;
			for (const { log, summary } of summaryResults) {
				if (summary && summary.total_tons > bestTons) {
					bestTons = summary.total_tons;
					bestLog = log;
					bestSummaryData = summary;
				}
			}

			if (bestLog && bestSummaryData && bestTons > 0) {
				bestDaySummary = {
					label: 'Best Day',
					sublabel: formatDate(bestLog.log_date),
					log_date: bestLog.log_date,
					total_tons: bestSummaryData.total_tons ?? 0,
					total_distance_ft: bestSummaryData.total_distance_ft ?? 0,
					total_loads: bestSummaryData.total_loads ?? 0,
					crew_count: bestLog.crew_count ?? null,
					hours_worked: bestSummaryData.hours_worked ?? 0,
					hasData: true
				};
			} else {
				bestDaySummary = {
					label: 'Best Day',
					sublabel: 'No data',
					log_date: null,
					total_tons: 0,
					total_distance_ft: 0,
					total_loads: 0,
					crew_count: null,
					hours_worked: 0,
					hasData: false
				};
			}
		} catch (e: any) {
			error = e?.message ?? 'Failed to load comparison data';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadData();
	});

	// The best tons across all three (for bar scaling)
	let maxTons = $derived(
		Math.max(
			todaySummary?.total_tons ?? 0,
			yesterdaySummary?.total_tons ?? 0,
			bestDaySummary?.total_tons ?? 0,
			1
		)
	);

	function barWidth(tons: number): string {
		const pct = Math.round((tons / maxTons) * 100);
		return `${pct}%`;
	}

	function barColor(tons: number): string {
		const pct = tons / maxTons;
		if (pct >= 0.9) return '#22c55e';
		if (pct >= 0.6) return '#f59e0b';
		return '#ef4444';
	}

	function computeProjection(day: DaySummary | null): number | null {
		if (!day || !day.hasData || isLogClosed) return null;
		if (day.hours_worked <= 0 || day.total_tons <= 0) return null;
		const rate = day.total_tons / day.hours_worked;
		return rate * 8;
	}

	let todayProjection = $derived(computeProjection(todaySummary));
</script>

<div class="compare-view">
	<div class="compare-header">
		<h3 class="compare-title">Day Comparison</h3>
		<p class="compare-sub">Today · Yesterday · Best Day</p>
	</div>

	{#if loading}
		<div class="compare-grid">
			{#each [0, 1, 2] as _}
				<div class="day-card skeleton-card">
					<div class="skel skel-label"></div>
					<div class="skel skel-val"></div>
					<div class="skel skel-bar"></div>
					<div class="skel skel-row"></div>
					<div class="skel skel-row"></div>
				</div>
			{/each}
		</div>
	{:else if error}
		<div class="compare-error">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"></circle>
				<line x1="12" y1="8" x2="12" y2="12"></line>
				<line x1="12" y1="16" x2="12.01" y2="16"></line>
			</svg>
			<span>{error}</span>
			<button class="retry-btn" onclick={loadData}>Retry</button>
		</div>
	{:else}
		<div class="compare-grid">
			{#each ([todaySummary, yesterdaySummary, bestDaySummary] as const) as day, i}
				{#if day}
					<div
						class="day-card"
						class:today-card={i === 0}
						class:best-card={i === 2}
						class:no-data={!day.hasData}
					>
						<div class="card-label-row">
							<span class="card-label">{day.label}</span>
							{#if i === 2 && day.hasData}
								<span class="best-badge">
									<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
									Best
								</span>
							{/if}
						</div>
						<span class="card-sublabel">{day.sublabel}</span>

						{#if day.hasData}
							<!-- Main metric: tons -->
							<div class="main-metric">
								<span class="metric-value">{formatTons(day.total_tons)}</span>
								<span class="metric-label">tons placed</span>
							</div>
							{#if i === 0 && day.hasData && day.hours_worked > 0 && day.total_tons > 0 && !isLogClosed}
								<div class="projection-hint">
									On pace for {((day.total_tons / day.hours_worked) * 8).toFixed(1)} T
								</div>
							{/if}

							<!-- Production bar -->
							<div class="bar-track">
								<div
									class="bar-fill"
									style="width: {barWidth(day.total_tons)}; background: {barColor(day.total_tons)};"
								></div>
							</div>

							<!-- Secondary stats -->
							<div class="stats-grid">
								<div class="stat-item">
									<span class="stat-val">{formatFeet(day.total_distance_ft)}</span>
									<span class="stat-key">distance</span>
								</div>
								<div class="stat-item">
									<span class="stat-val">{day.total_loads}</span>
									<span class="stat-key">loads</span>
								</div>
								{#if day.crew_count}
									<div class="stat-item">
										<span class="stat-val">{day.crew_count}</span>
										<span class="stat-key">crew</span>
									</div>
								{/if}
								{#if day.hours_worked > 0}
									<div class="stat-item">
										<span class="stat-val">{day.hours_worked.toFixed(1)}h</span>
										<span class="stat-key">worked</span>
									</div>
								{/if}
							</div>
						{:else}
							<div class="no-data-msg">
								<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
									<line x1="16" y1="2" x2="16" y2="6"></line>
									<line x1="8" y1="2" x2="8" y2="6"></line>
									<line x1="3" y1="10" x2="21" y2="10"></line>
								</svg>
								<span>No log recorded</span>
							</div>
						{/if}
					</div>
				{/if}
			{/each}
		</div>
	{/if}
</div>

<style>
	.compare-view {
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 16px;
		margin-bottom: 16px;
	}

	.compare-header {
		margin-bottom: 14px;
	}

	.compare-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-primary);
		margin: 0 0 2px 0;
	}

	.compare-sub {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0;
	}

	.compare-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	@media (min-width: 640px) {
		.compare-grid {
			flex-direction: row;
			align-items: stretch;
		}

		.compare-grid .day-card {
			flex: 1;
		}
	}

	.day-card {
		background: var(--bg-primary, #111);
		border: 1.5px solid var(--border);
		border-radius: 10px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		transition: border-color 0.2s;
	}

	.today-card {
		border-color: var(--accent);
	}

	.best-card {
		border-color: #f59e0b;
	}

	.no-data {
		opacity: 0.6;
	}

	.card-label-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.card-label {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.best-badge {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-size: 0.65rem;
		font-weight: 600;
		color: #f59e0b;
		background: rgba(245, 158, 11, 0.15);
		border-radius: 4px;
		padding: 2px 6px;
	}

	.card-sublabel {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: -4px;
	}

	.main-metric {
		display: flex;
		align-items: baseline;
		gap: 4px;
		margin-top: 4px;
	}

	.metric-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text-primary);
		line-height: 1;
	}

	.metric-label {
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.projection-hint {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin-top: -4px;
		font-style: italic;
	}

	.bar-track {
		height: 6px;
		background: var(--border);
		border-radius: 3px;
		overflow: hidden;
	}

	.bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.6s ease, background-color 0.3s;
		min-width: 4px;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px 12px;
		margin-top: 4px;
	}

	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.stat-val {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.stat-key {
		font-size: 0.65rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.no-data-msg {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 16px 0;
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	/* Skeleton loading */
	.skeleton-card {
		gap: 10px;
	}

	.skel {
		background: var(--border);
		border-radius: 4px;
		animation: pulse 1.5s ease-in-out infinite;
	}

	.skel-label { height: 14px; width: 60%; }
	.skel-val { height: 28px; width: 50%; }
	.skel-bar { height: 6px; width: 100%; }
	.skel-row { height: 12px; width: 80%; }

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.compare-error {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px;
		color: #ef4444;
		font-size: 0.875rem;
		background: rgba(239, 68, 68, 0.1);
		border-radius: 8px;
	}

	.retry-btn {
		margin-left: auto;
		font-size: 0.75rem;
		color: var(--accent);
		background: none;
		border: 1px solid var(--accent);
		border-radius: 6px;
		padding: 4px 10px;
		cursor: pointer;
		min-height: 32px;
	}

	.retry-btn:hover {
		background: rgba(var(--accent-rgb, 34 197 94), 0.1);
	}
</style>

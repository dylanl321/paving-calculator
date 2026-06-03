<script lang="ts">
	import { unitsStore } from '$lib/stores/units.svelte';
	import { toMetricTonnes, UNIT_LABELS } from '$lib/utils/unitConvert';
	import type { DbLoad } from '$lib/server/db';
	import type { DbDailyLog } from '$lib/server/db-logs';

	interface Props {
		jobSiteId: string;
		plannedTonnage: number | null;
		isAuthenticated?: boolean;
	}

	let { jobSiteId, plannedTonnage, isAuthenticated = false }: Props = $props();

	let loads = $state<DbLoad[]>([]);
	let logs = $state<DbDailyLog[]>([]);
	let loading = $state(true);
	let showDailyBreakdown = $state(false);

	// Load all data on mount
	$effect(() => {
		loadAllData();
	});

	async function loadAllData() {
		loading = true;
		if (!isAuthenticated) {
			loading = false;
			return;
		}

		try {
			// Fetch all loads (no date filter)
			const loadsRes = await fetch(`/api/job-sites/${jobSiteId}/loads?start_date=1970-01-01&limit=10000`, {
				credentials: 'include'
			});
			if (loadsRes.ok) {
				const loadsData = (await loadsRes.json()) as { loads?: DbLoad[] };
				loads = loadsData.loads || [];
			}

			// Fetch all logs
			const logsRes = await fetch(`/api/job-sites/${jobSiteId}/logs?limit=1000`, {
				credentials: 'include'
			});
			if (logsRes.ok) {
				const logsData = (await logsRes.json()) as { logs?: DbDailyLog[] };
				logs = logsData.logs || [];
			}
		} catch (e) {
			console.error('Failed to load waste/yield data:', e);
		}
		loading = false;
	}

	// Computed metrics
	const actualTonnageDelivered = $derived(
		loads.reduce((sum, load) => sum + load.tons, 0)
	);

	const rejectedTonnage = $derived(
		loads.filter(l => l.rejected).reduce((sum, load) => sum + load.tons, 0)
	);

	const netPlacedTonnage = $derived(
		loads.filter(l => !l.rejected).reduce((sum, load) => sum + load.tons, 0)
	);

	const wastePercent = $derived(
		actualTonnageDelivered > 0 ? (rejectedTonnage / actualTonnageDelivered) * 100 : 0
	);

	const overUnderVsPlan = $derived(
		plannedTonnage ? netPlacedTonnage - plannedTonnage : null
	);

	const overUnderPercent = $derived(
		plannedTonnage && plannedTonnage > 0 ? ((netPlacedTonnage - plannedTonnage) / plannedTonnage) * 100 : null
	);

	// Daily breakdown: group loads by date, compare to log target_tons
	const dailyBreakdown = $derived.by(() => {
		const dateMap = new Map<string, { target: number; actual: number; }>();

		// Get target from logs
		for (const log of logs) {
			if (log.target_tons) {
				dateMap.set(log.log_date, { target: log.target_tons, actual: 0 });
			}
		}

		// Accumulate actuals from loads
		for (const load of loads.filter(l => !l.rejected)) {
			const date = new Date(load.timestamp * 1000).toISOString().split('T')[0];
			const existing = dateMap.get(date) || { target: 0, actual: 0 };
			dateMap.set(date, { target: existing.target, actual: existing.actual + load.tons });
		}

		return [...dateMap.entries()]
			.map(([date, data]) => ({
				date,
				target: data.target,
				actual: data.actual,
				variance: data.actual - data.target,
				variancePct: data.target > 0 ? ((data.actual - data.target) / data.target) * 100 : 0
			}))
			.sort((a, b) => a.date.localeCompare(b.date));
	});

	const totalTargetTons = $derived(
		dailyBreakdown.reduce((sum, day) => sum + day.target, 0)
	);

	const totalActualTons = $derived(
		dailyBreakdown.reduce((sum, day) => sum + day.actual, 0)
	);

	// Display conversions
	function displayTons(tons: number): number {
		return unitsStore.system === 'metric' ? toMetricTonnes(tons) : tons;
	}

	function varianceColorClass(variancePct: number): string {
		const absPct = Math.abs(variancePct);
		if (absPct <= 3) return 'variance-good';
		if (absPct <= 10) return 'variance-warn';
		return 'variance-bad';
	}

	function overUnderColorClass(pct: number | null): string {
		if (pct == null) return '';
		const absPct = Math.abs(pct);
		if (absPct <= 3) return 'over-under-good';
		if (absPct <= 10) return 'over-under-warn';
		return 'over-under-bad';
	}

	function formatDate(dateStr: string): string {
		const d = new Date(dateStr + 'T00:00:00');
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}
</script>

<div class="waste-yield-analysis">
	<div class="panel-header">
		<h3>Waste &amp; Yield Analysis</h3>
	</div>

	{#if loading}
		<div class="loading-state">Loading analysis...</div>
	{:else if !isAuthenticated}
		<div class="empty-state">Sign in to view waste analysis</div>
	{:else if loads.length === 0}
		<div class="empty-state">No loads recorded yet</div>
	{:else}
		<!-- Section 1: Tonnage Overview -->
		<div class="stats-grid">
			{#if plannedTonnage}
				<div class="stat-item stat-planned">
					<div class="stat-label">Planned</div>
					<div class="stat-value">{displayTons(plannedTonnage).toFixed(1)}</div>
					<div class="stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				</div>
			{/if}

			<div class="stat-item stat-delivered">
				<div class="stat-label">Delivered</div>
				<div class="stat-value">{displayTons(actualTonnageDelivered).toFixed(1)}</div>
				<div class="stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
			</div>

			{#if rejectedTonnage > 0}
				<div class="stat-item stat-rejected">
					<div class="stat-label">Rejected</div>
					<div class="stat-value">{displayTons(rejectedTonnage).toFixed(1)}</div>
					<div class="stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				</div>
			{/if}

			<div class="stat-item stat-net">
				<div class="stat-label">Net Placed</div>
				<div class="stat-value">{displayTons(netPlacedTonnage).toFixed(1)}</div>
				<div class="stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
			</div>
		</div>

		<!-- Section 2: Waste Analysis bar -->
		{#if rejectedTonnage > 0}
			<div class="waste-bar-section">
				<div class="waste-bar-label">Waste Rate: {wastePercent.toFixed(1)}%</div>
				<div class="waste-bar-track">
					<div class="waste-bar-accepted" style="width: {((netPlacedTonnage / actualTonnageDelivered) * 100).toFixed(1)}%"></div>
					<div class="waste-bar-rejected" style="width: {wastePercent.toFixed(1)}%"></div>
				</div>
			</div>
		{:else}
			<div class="no-rejections">✓ No rejections</div>
		{/if}

		<!-- Section 3: vs Plan comparison -->
		{#if plannedTonnage && overUnderVsPlan != null}
			<div class="vs-plan-section {overUnderColorClass(overUnderPercent)}">
				{#if overUnderVsPlan > 0}
					<div class="vs-plan-value">+{displayTons(overUnderVsPlan).toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]} over plan</div>
				{:else if overUnderVsPlan < 0}
					<div class="vs-plan-value">{displayTons(overUnderVsPlan).toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]} under plan</div>
				{:else}
					<div class="vs-plan-value">On target</div>
				{/if}
				{#if overUnderPercent != null}
					<div class="vs-plan-pct">({overUnderPercent > 0 ? '+' : ''}{overUnderPercent.toFixed(1)}%)</div>
				{/if}
			</div>
		{/if}

		<!-- Section 4: Daily Breakdown table (collapsible) -->
		{#if dailyBreakdown.length > 0}
			<div class="daily-breakdown-section">
				<button
					class="breakdown-toggle"
					onclick={() => { showDailyBreakdown = !showDailyBreakdown; }}
				>
					{showDailyBreakdown ? '▼' : '▶'} Show daily breakdown ({dailyBreakdown.length} days)
				</button>

				{#if showDailyBreakdown}
					<div class="breakdown-table-wrapper">
						<table class="breakdown-table">
							<thead>
								<tr>
									<th>Date</th>
									<th>Target</th>
									<th>Actual</th>
									<th>Variance</th>
								</tr>
							</thead>
							<tbody>
								{#each dailyBreakdown as day}
									<tr>
										<td>{formatDate(day.date)}</td>
										<td>{displayTons(day.target).toFixed(1)}</td>
										<td>{displayTons(day.actual).toFixed(1)}</td>
										<td class="variance-cell {varianceColorClass(day.variancePct)}">
											{day.variance > 0 ? '+' : ''}{displayTons(day.variance).toFixed(1)}
											{#if day.target > 0}
												<span class="variance-pct">({day.variancePct > 0 ? '+' : ''}{day.variancePct.toFixed(0)}%)</span>
											{/if}
										</td>
									</tr>
								{/each}
								{#if dailyBreakdown.length > 1}
									<tr class="breakdown-footer">
										<td><strong>Total</strong></td>
										<td><strong>{displayTons(totalTargetTons).toFixed(1)}</strong></td>
										<td><strong>{displayTons(totalActualTons).toFixed(1)}</strong></td>
										<td class="variance-cell {varianceColorClass(totalTargetTons > 0 ? ((totalActualTons - totalTargetTons) / totalTargetTons) * 100 : 0)}">
											<strong>
												{totalActualTons - totalTargetTons > 0 ? '+' : ''}{displayTons(totalActualTons - totalTargetTons).toFixed(1)}
												{#if totalTargetTons > 0}
													<span class="variance-pct">({((totalActualTons - totalTargetTons) / totalTargetTons * 100).toFixed(0)}%)</span>
												{/if}
											</strong>
										</td>
									</tr>
								{/if}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>

<style>
	.waste-yield-analysis {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		margin-bottom: var(--sp-4);
	}

	.panel-header h3 {
		margin: 0 0 var(--sp-4) 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
	}

	.loading-state,
	.empty-state {
		padding: var(--sp-4);
		text-align: center;
		color: var(--text-muted);
		font-size: var(--fs-md);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.stat-item {
		text-align: center;
		padding: var(--sp-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
	}

	.stat-planned {
		background: color-mix(in srgb, #fbbf24 8%, transparent);
		border-color: color-mix(in srgb, #fbbf24 25%, transparent);
	}

	.stat-delivered {
		background: color-mix(in srgb, #3b82f6 8%, transparent);
		border-color: color-mix(in srgb, #3b82f6 25%, transparent);
	}

	.stat-rejected {
		background: color-mix(in srgb, #ef4444 8%, transparent);
		border-color: color-mix(in srgb, #ef4444 25%, transparent);
	}

	.stat-net {
		background: color-mix(in srgb, #22c55e 8%, transparent);
		border-color: color-mix(in srgb, #22c55e 25%, transparent);
	}

	.stat-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-1);
	}

	.stat-value {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		color: var(--text);
		line-height: 1.2;
	}

	.stat-unit {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.waste-bar-section {
		margin-bottom: var(--sp-4);
	}

	.waste-bar-label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}

	.waste-bar-track {
		display: flex;
		height: 24px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--surface-alt);
		border: 1px solid var(--border);
	}

	.waste-bar-accepted {
		background: #22c55e;
		transition: width 0.3s ease;
	}

	.waste-bar-rejected {
		background: #ef4444;
		transition: width 0.3s ease;
	}

	.no-rejections {
		padding: var(--sp-3);
		text-align: center;
		color: #22c55e;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		background: color-mix(in srgb, #22c55e 8%, transparent);
		border: 1px solid color-mix(in srgb, #22c55e 25%, transparent);
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
	}

	.vs-plan-section {
		padding: var(--sp-4);
		text-align: center;
		border-radius: var(--radius-md);
		margin-bottom: var(--sp-4);
		border: 1px solid var(--border);
	}

	.vs-plan-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		margin-bottom: var(--sp-1);
	}

	.vs-plan-pct {
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		opacity: 0.8;
	}

	.over-under-good {
		background: color-mix(in srgb, #22c55e 8%, transparent);
		border-color: color-mix(in srgb, #22c55e 25%, transparent);
		color: #22c55e;
	}

	.over-under-warn {
		background: color-mix(in srgb, #fbbf24 8%, transparent);
		border-color: color-mix(in srgb, #fbbf24 25%, transparent);
		color: #fbbf24;
	}

	.over-under-bad {
		background: color-mix(in srgb, #ef4444 8%, transparent);
		border-color: color-mix(in srgb, #ef4444 25%, transparent);
		color: #ef4444;
	}

	.daily-breakdown-section {
		margin-top: var(--sp-4);
		padding-top: var(--sp-4);
		border-top: 1px solid var(--border);
	}

	.breakdown-toggle {
		min-height: 48px;
		width: 100%;
		padding: var(--sp-3);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}

	.breakdown-toggle:hover {
		background: var(--surface-hover);
	}

	.breakdown-table-wrapper {
		margin-top: var(--sp-3);
		overflow-x: auto;
	}

	.breakdown-table {
		width: 100%;
		border-collapse: collapse;
		font-size: var(--fs-sm);
	}

	.breakdown-table th {
		padding: var(--sp-2);
		text-align: left;
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
		border-bottom: 1px solid var(--border);
		font-size: var(--fs-xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.breakdown-table td {
		padding: var(--sp-2);
		border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	.breakdown-table .breakdown-footer td {
		border-top: 2px solid var(--border);
		border-bottom: none;
		padding-top: var(--sp-3);
	}

	.variance-cell {
		font-weight: var(--fw-medium);
	}

	.variance-pct {
		font-size: var(--fs-xs);
		opacity: 0.7;
		margin-left: var(--sp-1);
	}

	.variance-good {
		color: #22c55e;
	}

	.variance-warn {
		color: #fbbf24;
	}

	.variance-bad {
		color: #ef4444;
	}

	@media (max-width: 460px) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.breakdown-table {
			font-size: var(--fs-xs);
		}

		.breakdown-table th,
		.breakdown-table td {
			padding: var(--sp-1);
		}
	}
</style>

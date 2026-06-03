<script lang="ts">
	import type { LogSummary } from '$lib/server/db-logs';

	interface LogWithSummary {
		id: string;
		log_date: string;
		summary?: LogSummary;
		[key: string]: unknown;
	}

	interface WeekRollup {
		label: string;
		weekStart: string;
		weekEnd: string;
		totalTons: number;
		totalDistanceFt: number;
		totalLoads: number;
		daysWorked: number;
		avgTonsPerDay: number;
	}

	interface MonthRollup {
		label: string;
		year: number;
		month: number;
		totalTons: number;
		totalDistanceFt: number;
		totalLoads: number;
		daysWorked: number;
		avgTonsPerDay: number;
	}

	let {
		logs = [],
		jobSiteName = '',
		open = $bindable(false)
	}: {
		logs: LogWithSummary[];
		jobSiteName?: string;
		open: boolean;
	} = $props();

	type TabType = 'weekly' | 'monthly';
	let activeTab = $state<TabType>('weekly');

	function getISOWeekStart(dateStr: string): Date {
		const d = new Date(dateStr + 'T00:00:00');
		const day = d.getDay(); // 0 = Sunday
		const diff = (day === 0 ? -6 : 1 - day);
		d.setDate(d.getDate() + diff);
		return d;
	}

	function formatWeekLabel(startDate: Date): string {
		const endDate = new Date(startDate);
		endDate.setDate(endDate.getDate() + 6);
		const startFmt = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		const endFmt = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
		return `${startFmt} - ${endFmt}`;
	}

	function formatMonthLabel(year: number, month: number): string {
		const d = new Date(year, month - 1, 1);
		return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
	}

	function formatDistance(ft: number): string {
		if (ft >= 5280) {
			return `${(ft / 5280).toFixed(2)} mi`;
		}
		return `${Math.round(ft).toLocaleString()} ft`;
	}

	const weeklyRollups = $derived((): WeekRollup[] => {
		const weekMap = new Map<string, WeekRollup>();

		for (const log of logs) {
			if (!log.summary) continue;
			const weekStart = getISOWeekStart(log.log_date);
			const weekEnd = new Date(weekStart);
			weekEnd.setDate(weekEnd.getDate() + 6);
			const key = weekStart.toISOString().split('T')[0];

			if (!weekMap.has(key)) {
				weekMap.set(key, {
					label: formatWeekLabel(weekStart),
					weekStart: key,
					weekEnd: weekEnd.toISOString().split('T')[0],
					totalTons: 0,
					totalDistanceFt: 0,
					totalLoads: 0,
					daysWorked: 0,
					avgTonsPerDay: 0
				});
			}

			const week = weekMap.get(key)!;
			week.totalTons += log.summary.total_tons ?? 0;
			week.totalDistanceFt += log.summary.total_distance_ft ?? 0;
			week.totalLoads += log.summary.total_loads ?? 0;
			week.daysWorked += 1;
		}

		const weeks = Array.from(weekMap.values())
			.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

		for (const week of weeks) {
			week.avgTonsPerDay = week.daysWorked > 0 ? week.totalTons / week.daysWorked : 0;
		}

		// Return last 8 weeks
		return weeks.slice(-8);
	});

	const monthlyRollups = $derived((): MonthRollup[] => {
		const monthMap = new Map<string, MonthRollup>();

		for (const log of logs) {
			if (!log.summary) continue;
			const [yearStr, monthStr] = log.log_date.split('-');
			const year = parseInt(yearStr);
			const month = parseInt(monthStr);
			const key = `${year}-${String(month).padStart(2, '0')}`;

			if (!monthMap.has(key)) {
				monthMap.set(key, {
					label: formatMonthLabel(year, month),
					year,
					month,
					totalTons: 0,
					totalDistanceFt: 0,
					totalLoads: 0,
					daysWorked: 0,
					avgTonsPerDay: 0
				});
			}

			const m = monthMap.get(key)!;
			m.totalTons += log.summary.total_tons ?? 0;
			m.totalDistanceFt += log.summary.total_distance_ft ?? 0;
			m.totalLoads += log.summary.total_loads ?? 0;
			m.daysWorked += 1;
		}

		const months = Array.from(monthMap.values())
			.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month);

		for (const m of months) {
			m.avgTonsPerDay = m.daysWorked > 0 ? m.totalTons / m.daysWorked : 0;
		}

		// Return last 6 months
		return months.slice(-6);
	});

	const maxWeeklyTons = $derived(
		weeklyRollups().length > 0 ? Math.max(...weeklyRollups().map((w) => w.totalTons), 1) : 1
	);

	const maxMonthlyTons = $derived(
		monthlyRollups().length > 0 ? Math.max(...monthlyRollups().map((m) => m.totalTons), 1) : 1
	);

	function getTrend(current: number, previous: number): 'up' | 'down' | 'same' {
		const threshold = 0.01;
		if (previous === 0) return current > 0 ? 'up' : 'same';
		const pct = (current - previous) / previous;
		if (pct > threshold) return 'up';
		if (pct < -threshold) return 'down';
		return 'same';
	}

	function getTrendPct(current: number, previous: number): string {
		if (previous === 0) return '';
		const pct = ((current - previous) / previous) * 100;
		return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
	}

	function close() {
		open = false;
	}

	function onOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) close();
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="overlay" onclick={onOverlayClick}>
		<div class="sheet" role="dialog" aria-modal="true" aria-label="Rollup Reports">
			<div class="sheet-header">
				<div>
					<h2 class="sheet-title">Reports</h2>
					{#if jobSiteName}
						<p class="sheet-subtitle">{jobSiteName}</p>
					{/if}
				</div>
				<button class="close-btn" onclick={close} aria-label="Close reports">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>

			<div class="tab-bar">
				<button
					class="tab-btn"
					class:active={activeTab === 'weekly'}
					onclick={() => (activeTab = 'weekly')}
				>
					Weekly
				</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'monthly'}
					onclick={() => (activeTab = 'monthly')}
				>
					Monthly
				</button>
			</div>

			<div class="sheet-body">
				{#if activeTab === 'weekly'}
					{@const weeks = weeklyRollups()}
					{#if weeks.length === 0}
						<p class="empty">No weekly data yet. Log some production days to see rollups.</p>
					{:else}
						<!-- Bar chart -->
						<div class="chart-section">
							<h3 class="section-title">Weekly Tons Placed</h3>
							<div class="bar-chart">
								{#each weeks as week, i}
									{@const barPct = maxWeeklyTons > 0 ? (week.totalTons / maxWeeklyTons) * 100 : 0}
									{@const prev = i > 0 ? weeks[i - 1].totalTons : 0}
									{@const trend = i > 0 ? getTrend(week.totalTons, prev) : 'same'}
									<div class="bar-group">
										<div class="bar-track">
											<div class="bar-fill" style="height: {barPct}%">
												{#if trend === 'up'}
													<span class="trend trend-up" aria-label="up">▲</span>
												{:else if trend === 'down'}
													<span class="trend trend-down" aria-label="down">▼</span>
												{/if}
											</div>
										</div>
										<span class="bar-label">{week.label.split(' - ')[0]}</span>
										<span class="bar-value">{week.totalTons.toFixed(1)}t</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Week cards -->
						<div class="rollup-list">
							{#each [...weeks].reverse() as week, i}
								{@const prevWeek = [...weeks].reverse()[i + 1]}
								{@const trend = prevWeek ? getTrend(week.totalTons, prevWeek.totalTons) : 'same'}
								{@const trendPct = prevWeek ? getTrendPct(week.totalTons, prevWeek.totalTons) : ''}
								<div class="rollup-card">
									<div class="rollup-header">
										<span class="rollup-label">{week.label}</span>
										{#if trend !== 'same' && trendPct}
											<span class="trend-badge" class:trend-up={trend === 'up'} class:trend-down={trend === 'down'}>
												{trend === 'up' ? '▲' : '▼'} {trendPct}
											</span>
										{/if}
									</div>
									<div class="rollup-stats">
										<div class="rollup-stat">
											<span class="stat-label">Tons</span>
											<span class="stat-value">{week.totalTons.toFixed(1)}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Distance</span>
											<span class="stat-value">{formatDistance(week.totalDistanceFt)}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Loads</span>
											<span class="stat-value">{week.totalLoads}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Days</span>
											<span class="stat-value">{week.daysWorked}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Avg t/day</span>
											<span class="stat-value">{week.avgTonsPerDay.toFixed(1)}</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					{@const months = monthlyRollups()}
					{#if months.length === 0}
						<p class="empty">No monthly data yet. Log some production days to see rollups.</p>
					{:else}
						<!-- Bar chart -->
						<div class="chart-section">
							<h3 class="section-title">Monthly Tons Placed</h3>
							<div class="bar-chart">
								{#each months as month, i}
									{@const barPct = maxMonthlyTons > 0 ? (month.totalTons / maxMonthlyTons) * 100 : 0}
									{@const prev = i > 0 ? months[i - 1].totalTons : 0}
									{@const trend = i > 0 ? getTrend(month.totalTons, prev) : 'same'}
									<div class="bar-group">
										<div class="bar-track">
											<div class="bar-fill" style="height: {barPct}%">
												{#if trend === 'up'}
													<span class="trend trend-up" aria-label="up">▲</span>
												{:else if trend === 'down'}
													<span class="trend trend-down" aria-label="down">▼</span>
												{/if}
											</div>
										</div>
										<span class="bar-label">{month.label.split(' ')[0].substring(0, 3)}</span>
										<span class="bar-value">{month.totalTons.toFixed(0)}t</span>
									</div>
								{/each}
							</div>
						</div>

						<!-- Month cards -->
						<div class="rollup-list">
							{#each [...months].reverse() as month, i}
								{@const prevMonth = [...months].reverse()[i + 1]}
								{@const trend = prevMonth ? getTrend(month.totalTons, prevMonth.totalTons) : 'same'}
								{@const trendPct = prevMonth ? getTrendPct(month.totalTons, prevMonth.totalTons) : ''}
								<div class="rollup-card">
									<div class="rollup-header">
										<span class="rollup-label">{month.label}</span>
										{#if trend !== 'same' && trendPct}
											<span class="trend-badge" class:trend-up={trend === 'up'} class:trend-down={trend === 'down'}>
												{trend === 'up' ? '▲' : '▼'} {trendPct}
											</span>
										{/if}
									</div>
									<div class="rollup-stats">
										<div class="rollup-stat">
											<span class="stat-label">Tons</span>
											<span class="stat-value">{month.totalTons.toFixed(1)}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Distance</span>
											<span class="stat-value">{formatDistance(month.totalDistanceFt)}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Loads</span>
											<span class="stat-value">{month.totalLoads}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Days</span>
											<span class="stat-value">{month.daysWorked}</span>
										</div>
										<div class="rollup-stat">
											<span class="stat-label">Avg t/day</span>
											<span class="stat-value">{month.avgTonsPerDay.toFixed(1)}</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		z-index: 200;
		display: flex;
		align-items: flex-end;
		animation: fade-in 0.2s ease;
	}

	@keyframes fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slide-up {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}

	.sheet {
		width: 100%;
		max-height: 92vh;
		background: var(--surface);
		border-radius: var(--radius) var(--radius) 0 0;
		display: flex;
		flex-direction: column;
		animation: slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1);
	}

	.sheet-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 20px 20px 12px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.sheet-title {
		margin: 0 0 2px;
		font-size: 1.15rem;
		font-weight: 700;
		color: var(--text);
	}

	.sheet-subtitle {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.close-btn {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 50%;
		cursor: pointer;
		color: var(--text-muted);
		flex-shrink: 0;
		transition: background 0.15s;
	}

	.close-btn:hover {
		background: var(--bg);
		color: var(--text);
	}

	.tab-bar {
		display: flex;
		gap: 0;
		padding: 12px 20px 0;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
	}

	.tab-btn {
		min-height: 48px;
		padding: 0 20px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-muted);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
		margin-bottom: -1px;
	}

	.tab-btn.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.tab-btn:hover:not(.active) {
		color: var(--text);
	}

	.sheet-body {
		overflow-y: auto;
		flex: 1;
		padding: 0 0 env(safe-area-inset-bottom, 20px);
		-webkit-overflow-scrolling: touch;
	}

	.empty {
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
		padding: 48px 24px;
		margin: 0;
	}

	/* Bar chart */
	.chart-section {
		padding: 20px 20px 0;
	}

	.section-title {
		margin: 0 0 16px;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.bar-chart {
		display: flex;
		align-items: flex-end;
		gap: 6px;
		height: 120px;
		padding-bottom: 36px; /* space for labels */
		position: relative;
		border-bottom: 1px solid var(--border);
		margin-bottom: 20px;
	}

	.bar-group {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		position: relative;
	}

	.bar-track {
		flex: 1;
		width: 100%;
		display: flex;
		align-items: flex-end;
	}

	.bar-fill {
		width: 100%;
		background: var(--accent);
		border-radius: 3px 3px 0 0;
		min-height: 2px;
		position: relative;
		transition: height 0.4s ease;
		opacity: 0.85;
	}

	.trend {
		position: absolute;
		top: -16px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.6rem;
	}

	.trend-up {
		color: #22c55e;
	}

	.trend-down {
		color: #ef4444;
	}

	.bar-label {
		position: absolute;
		bottom: -28px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.6rem;
		color: var(--text-muted);
		white-space: nowrap;
		overflow: hidden;
		max-width: 44px;
		text-overflow: ellipsis;
	}

	.bar-value {
		position: absolute;
		bottom: -42px;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.58rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	/* Rollup cards */
	.rollup-list {
		padding: 4px 16px 24px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.rollup-card {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 14px 16px;
	}

	.rollup-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		gap: 8px;
	}

	.rollup-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
	}

	.trend-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 12px;
		white-space: nowrap;
	}

	.trend-badge.trend-up {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}

	.trend-badge.trend-down {
		background: rgba(239, 68, 68, 0.12);
		color: #ef4444;
	}

	.rollup-stats {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
	}

	.rollup-stat {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.stat-label {
		font-size: 0.65rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.stat-value {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--accent);
	}
</style>

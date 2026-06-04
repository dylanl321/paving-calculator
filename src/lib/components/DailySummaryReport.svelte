<script lang="ts">
	import { onMount } from 'svelte';
	import type { DbDailyLog } from '$lib/server/db-logs';
	import { formatFeet } from '$lib/utils/format';
	import SharePDFButton from '$lib/components/SharePDFButton.svelte';

	interface Props {
		jobSiteId: string;
		log: DbDailyLog;
		onClose: () => void;
		onGeneratePDF?: () => void;
	}

	let { jobSiteId, log, onClose, onGeneratePDF }: Props = $props();

	let loading = $state(true);
	let entries = $state<any[]>([]);
	let summary = $state<any>({
		total_distance_ft: 0,
		total_tons: 0,
		total_loads: 0,
		total_tack_gallons: 0,
		hours_worked: 0
	});
	let densityReadings = $state<any[]>([]);
	let loads = $state<any[]>([]);
	let recipientCount = $state(0);

	const weatherIcons: Record<string, string> = {
		clear: '☀️',
		cloudy: '☁️',
		rain: '🌧️',
		wind: '💨',
		fog: '🌫️'
	};

	const entryTypeColors: Record<string, string> = {
		paving: 'var(--accent)',
		milling: '#f97316',
		tack: '#3b82f6',
		break: 'var(--text-muted)',
		delay: '#ef4444',
		note: 'var(--text-muted)'
	};

	const entryTypeLabels: Record<string, string> = {
		paving: 'Paving',
		milling: 'Milling',
		tack: 'Tack',
		break: 'Break',
		delay: 'Delay',
		note: 'Note'
	};

	onMount(async () => {
		await loadData();
		await loadRecipientCount();
	});

	async function loadRecipientCount() {
		try {
			const res = await fetch('/api/org/settings');
			if (res.ok) {
				const data = (await res.json()) as { reportRecipients?: unknown[] };
				recipientCount = data.reportRecipients?.length ?? 0;
			}
		} catch {
			// Failed to load, keep recipientCount at 0
		}
	}

	async function loadData() {
		loading = true;
		try {
			const [logRes, loadsRes] = await Promise.all([
				fetch(`/api/job-sites/${jobSiteId}/logs/${log.id}`),
				fetch(
					`/api/job-sites/${jobSiteId}/loads?start_date=${log.log_date}&end_date=${log.log_date}`
				)
			]);

			if (logRes.ok) {
				const data = (await logRes.json()) as { entries?: any[]; summary?: any; densityReadings?: any[] };
				entries = data.entries ?? [];
				summary = data.summary ?? summary;
				densityReadings = data.densityReadings ?? [];
			}

			if (loadsRes.ok) {
				const data = (await loadsRes.json()) as { loads?: any[] };
				loads = data.loads ?? [];
			}
		} finally {
			loading = false;
		}
	}

	const dateLabel = $derived(
		new Date(log.log_date + 'T00:00:00').toLocaleDateString('en-US', {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		})
	);

	const hoursWorked = $derived.by(() => {
		if (!log.start_time || !log.end_time) return summary.hours_worked ?? 0;
		const [sh, sm] = log.start_time.split(':').map(Number);
		const [eh, em] = log.end_time.split(':').map(Number);
		return Math.max(0, (eh * 60 + em - (sh * 60 + sm)) / 60);
	});

	const avgTonsPerLoad = $derived(
		summary.total_loads > 0
			? (summary.total_tons / summary.total_loads).toFixed(1)
			: null
	);

	const targetPct = $derived.by(() => {
		if (!log.target_tons || log.target_tons <= 0) return null;
		return Math.min(100, (summary.total_tons / log.target_tons) * 100);
	});

	function fmtFeet(ft: number | null): string {
		if (ft == null || ft === 0) return '—';
		return formatFeet(ft);
	}

	function fmtTons(t: number): string {
		return t.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	}

	function fmtTime(hhmm: string | null): string {
		if (!hhmm) return '—';
		const [h, m] = hhmm.split(':').map(Number);
		const ampm = h >= 12 ? 'PM' : 'AM';
		const h12 = h % 12 || 12;
		return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
	}

	function fmtUnixTime(ts: number): string {
		return new Date(ts * 1000).toLocaleTimeString('en-US', {
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function compactionColor(pct: number | null): string {
		if (pct == null) return 'var(--text-muted)';
		if (pct >= 95) return '#22c55e';
		if (pct >= 90) return 'var(--accent)';
		return '#ef4444';
	}

	function targetPctColor(pct: number): string {
		if (pct >= 95) return '#22c55e';
		if (pct >= 80) return 'var(--accent)';
		return '#ef4444';
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) onClose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	async function exportCSV() {
		const { exportDailySummaryCSV } = await import('$lib/utils/csv-export');
		exportDailySummaryCSV({
			date: log.log_date,
			siteName: 'Job Site',
			entries,
			loads,
			densityReadings,
			summary
		});
	}

	async function getPdfBlob(): Promise<Blob> {
		const { generateDailyReportPDFBlob } = await import('$lib/utils/pdf-export');
		const { job: jobState } = await import('$lib/stores/job.svelte');

		// Build report data
		const reportData = {
			date: log.log_date,
			siteName: 'Job Site',
			weatherTempF: log.weather_temp_f,
			weatherConditions: log.weather_conditions,
			windSpeedMph: log.wind_speed_mph,
			crewCount: log.crew_count,
			startTime: log.start_time,
			endTime: log.end_time,
			notes: log.notes,
			entries: entries.map((e: any) => ({
				entry_type: e.entry_type,
				timestamp: e.timestamp,
				station_start: e.station_start,
				station_end: e.station_end,
				distance_ft: e.distance_ft,
				tons_placed: e.tons_placed,
				loads_count: e.loads_count,
				truck_tickets: e.truck_tickets,
				spread_rate_actual: e.spread_rate_actual,
				tack_gallons: e.tack_gallons,
				lane: e.lane,
				notes: e.notes
			})),
			loads,
			totals: {
				totalTons: summary.total_tons,
				totalDistanceFt: summary.total_distance_ft,
				totalLoads: summary.total_loads,
				totalTackGallons: summary.total_tack_gallons,
				hoursWorked: hoursWorked
			},
			yield: {
				actualRate: null,
				targetRate: null,
				diffPct: null
			},
			compliance: null
		};

		return await generateDailyReportPDFBlob(jobState, reportData);
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="overlay" onclick={handleBackdrop} role="dialog" aria-modal="true" tabindex="-1" aria-label="Daily Production Summary">
	<div class="sheet">
		<!-- Header -->
		<div class="sheet-header">
			<div class="header-info">
				<h2 class="sheet-title">Daily Production Summary</h2>
				<p class="sheet-date">{dateLabel}</p>
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
				<p>Loading summary…</p>
			</div>
		{:else}
			<div class="sheet-body">

				<!-- Day Info Banner -->
				<div class="day-banner">
					<div class="banner-left">
						{#if log.foreman_name}
							<div class="foreman-row">
								<span class="foreman-name">{log.foreman_name}</span>
								{#if log.closed_at}
									<span class="closed-badge">Closed</span>
								{/if}
							</div>
						{/if}
						{#if log.plant_name || log.mix_type}
							<div class="plant-row">
								{#if log.plant_name}<span>{log.plant_name}</span>{/if}
								{#if log.plant_name && log.mix_type}<span class="sep">·</span>{/if}
								{#if log.mix_type}<span>{log.mix_type}</span>{/if}
							</div>
						{/if}
					</div>
					<div class="weather-chips">
						{#if log.weather_temp_f != null}
							<span class="chip">{log.weather_temp_f}°F</span>
						{/if}
						{#if log.weather_conditions}
							<span class="chip">{weatherIcons[log.weather_conditions] ?? ''} {log.weather_conditions}</span>
						{/if}
						{#if log.wind_speed_mph != null}
							<span class="chip">💨 {log.wind_speed_mph} mph</span>
						{/if}
						{#if log.crew_count != null}
							<span class="chip">👷 {log.crew_count}</span>
						{/if}
						{#if log.start_time || log.end_time}
							<span class="chip">🕐 {fmtTime(log.start_time)}–{fmtTime(log.end_time)}</span>
						{/if}
					</div>
				</div>

				<!-- Production Totals -->
				<section class="section">
					<h3 class="section-title">Production Totals</h3>
					<div class="totals-grid">
						<div class="total-card">
							<span class="total-label">Tons Placed</span>
							<span class="total-value">{fmtTons(summary.total_tons)}</span>
							<span class="total-unit">tons</span>
						</div>
						<div class="total-card">
							<span class="total-label">Distance Paved</span>
							<span class="total-value">{fmtFeet(summary.total_distance_ft)}</span>
						</div>
						<div class="total-card">
							<span class="total-label">Loads</span>
							<span class="total-value">{summary.total_loads}</span>
						</div>
						<div class="total-card">
							<span class="total-label">Tack Applied</span>
							<span class="total-value">{Math.round(summary.total_tack_gallons)}</span>
							<span class="total-unit">gal</span>
						</div>
						<div class="total-card">
							<span class="total-label">Hours Worked</span>
							<span class="total-value">{hoursWorked.toFixed(1)}</span>
							<span class="total-unit">hrs</span>
						</div>
						{#if avgTonsPerLoad}
							<div class="total-card">
								<span class="total-label">Avg T/Load</span>
								<span class="total-value">{avgTonsPerLoad}</span>
								<span class="total-unit">tons</span>
							</div>
						{/if}
					</div>
				</section>

				<!-- Target Progress -->
				{#if log.target_tons && log.target_tons > 0 && targetPct !== null}
					<section class="section">
						<h3 class="section-title">Target Progress</h3>
						<div class="progress-section">
							<div class="progress-labels">
								<span>{fmtTons(summary.total_tons)} tons placed</span>
								<span style="color: {targetPctColor(targetPct)}">{targetPct.toFixed(0)}%</span>
							</div>
							<div class="progress-bar-track">
								<div
									class="progress-bar-fill"
									style="width: {targetPct}%; background: {targetPctColor(targetPct)}"
								></div>
							</div>
							<p class="progress-note">Target: {fmtTons(log.target_tons)} tons</p>
						</div>
					</section>
				{/if}

				<!-- Timeline / Entries -->
				{#if entries.length > 0}
					<section class="section">
						<h3 class="section-title">Timeline ({entries.length} entries)</h3>
						<div class="entries-list">
							{#each entries as entry}
								<div class="entry-card">
									<div class="entry-header">
										<span class="entry-time">{entry.timestamp ?? '—'}</span>
										<span
											class="entry-type-badge"
											style="background: {entryTypeColors[entry.entry_type] ?? 'var(--text-muted)'}20; color: {entryTypeColors[entry.entry_type] ?? 'var(--text-muted)'}; border: 1px solid {entryTypeColors[entry.entry_type] ?? 'var(--text-muted)'}40"
										>
											{entryTypeLabels[entry.entry_type] ?? entry.entry_type}
										</span>
										{#if entry.lane}
											<span class="entry-lane">Lane {entry.lane}</span>
										{/if}
									</div>
									<div class="entry-stats">
										{#if entry.distance_ft}
											<span class="entry-stat">📏 {fmtFeet(entry.distance_ft)}</span>
										{/if}
										{#if entry.tons_placed}
											<span class="entry-stat">⚖️ {fmtTons(entry.tons_placed)} T</span>
										{/if}
										{#if entry.loads_count}
											<span class="entry-stat">🚛 {entry.loads_count} loads</span>
										{/if}
										{#if entry.spread_rate_actual}
											<span class="entry-stat">📊 {Math.round(entry.spread_rate_actual)} lbs/SY</span>
										{/if}
										{#if entry.tack_gallons}
											<span class="entry-stat">💧 {Math.round(entry.tack_gallons)} gal</span>
										{/if}
									</div>
									{#if entry.notes}
										<p class="entry-notes">{entry.notes}</p>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Load Detail -->
				{#if loads.length > 0}
					<section class="section">
						<h3 class="section-title">Load Detail ({loads.length} loads)</h3>
						<div class="loads-table">
							<div class="loads-header-row">
								<span>Time</span>
								<span>Ticket</span>
								<span>Tons</span>
								<span>Rate</span>
							</div>
							{#each loads as load}
								<div class="loads-row">
									<span class="load-time">{fmtUnixTime(load.timestamp)}</span>
									<span class="load-ticket">{load.ticket_number ?? '—'}</span>
									<span class="load-tons">{fmtTons(load.tons)}</span>
									<span class="load-rate">{load.spread_rate ? `${Math.round(load.spread_rate)} lbs/SY` : '—'}</span>
								</div>
							{/each}
							<div class="loads-total-row">
								<span>Total</span>
								<span></span>
								<span>{fmtTons(loads.reduce((s, l) => s + l.tons, 0))} T</span>
								<span></span>
							</div>
						</div>
					</section>
				{/if}

				<!-- Density Readings -->
				{#if densityReadings.length > 0}
					<section class="section">
						<h3 class="section-title">Density Readings ({densityReadings.length})</h3>
						<div class="density-table">
							<div class="density-header-row">
								<span>Station</span>
								<span>Lane</span>
								<span>Wet PCF</span>
								<span>Dry PCF</span>
								<span>Compaction</span>
							</div>
							{#each densityReadings as reading}
								<div class="density-row">
									<span>{reading.station_number}</span>
									<span>{reading.lane ?? '—'}</span>
									<span>{reading.wet_density_pcf.toFixed(1)}</span>
									<span>{reading.dry_density_pcf?.toFixed(1) ?? '—'}</span>
									<span style="color: {compactionColor(reading.compaction_pct)}; font-weight: 700">
										{reading.compaction_pct != null ? `${reading.compaction_pct.toFixed(1)}%` : '—'}
									</span>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				<!-- Notes -->
				{#if log.notes}
					<section class="section">
						<h3 class="section-title">Notes</h3>
						<p class="notes-text">{log.notes}</p>
					</section>
				{/if}

			</div>

			<!-- Footer -->
			<div class="sheet-footer">
				<SharePDFButton
					getPdfBlob={async () => {
						const { getDailyReportPDFBlob } = await import('$lib/utils/pdf-export');
						const { job: jobState } = await import('$lib/stores/job.svelte');
						return await getDailyReportPDFBlob(
							jobState,
							{
								date: log.log_date,
								siteName: 'Job Site',
								entries,
								loads,
								totals: summary,
								yield: {
									actualRate: null,
									targetRate: null,
									diffPct: null
								},
								weatherTempF: log.weather_temp_f,
								weatherConditions: log.weather_conditions,
								windSpeedMph: log.wind_speed_mph,
								crewCount: log.crew_count,
								startTime: log.start_time,
								endTime: log.end_time,
								notes: log.notes
							}
						);
					}}
					filename={`daily-summary-${log.log_date}.pdf`}
				/>
				<button class="btn-print" onclick={() => window.print()}>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<polyline points="6 9 6 2 18 2 18 9"></polyline>
						<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
						<rect x="6" y="14" width="12" height="8"></rect>
					</svg>
					Print
				</button>
				{#if onGeneratePDF}
					<button class="btn-secondary" onclick={onGeneratePDF}>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
						</svg>
						Generate PDF
					</button>
				{/if}
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

	.sheet-title {
		font-size: 1.1rem;
		font-weight: 700;
		margin: 0 0 2px;
		color: var(--text);
	}

	.sheet-date {
		font-size: 0.85rem;
		color: var(--text-muted);
		margin: 0;
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

	/* Day banner */
	.day-banner {
		padding: 16px 20px;
		background: var(--surface);
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.banner-left {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.foreman-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.foreman-name {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--text);
	}

	.closed-badge {
		background: #22c55e20;
		color: #22c55e;
		border: 1px solid #22c55e40;
		font-size: 0.7rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 100px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.plant-row {
		font-size: 0.82rem;
		color: var(--text-muted);
		display: flex;
		gap: 6px;
	}

	.sep {
		color: var(--border);
	}

	.weather-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.chip {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 100px;
		font-size: 0.78rem;
		padding: 4px 10px;
		color: var(--text-muted);
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

	.total-unit {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	/* Target progress */
	.progress-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.progress-labels {
		display: flex;
		justify-content: space-between;
		font-size: 0.9rem;
		font-weight: 600;
	}

	.progress-bar-track {
		height: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 100px;
		overflow: hidden;
	}

	.progress-bar-fill {
		height: 100%;
		border-radius: 100px;
		transition: width 0.5s ease;
	}

	.progress-note {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin: 0;
	}

	/* Entries */
	.entries-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.entry-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 12px 14px;
	}

	.entry-header {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 6px;
	}

	.entry-time {
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--text-muted);
		min-width: 40px;
	}

	.entry-type-badge {
		font-size: 0.72rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 100px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.entry-lane {
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-left: auto;
	}

	.entry-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.entry-stat {
		font-size: 0.82rem;
		color: var(--text);
	}

	.entry-notes {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin: 6px 0 0;
		line-height: 1.4;
	}

	/* Loads table */
	.loads-table {
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		font-size: 0.82rem;
	}

	.loads-header-row,
	.loads-row,
	.loads-total-row {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr 1.2fr;
		padding: 10px 14px;
		gap: 8px;
	}

	.loads-header-row {
		background: var(--surface-alt);
		color: var(--text-muted);
		font-weight: 700;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.loads-row {
		border-top: 1px solid var(--border);
		color: var(--text);
	}

	.loads-row:nth-child(even) {
		background: var(--surface);
	}

	.loads-total-row {
		border-top: 2px solid var(--border);
		background: var(--surface-alt);
		font-weight: 700;
		color: var(--accent);
	}

	.load-ticket {
		color: var(--text-muted);
		font-size: 0.78rem;
	}

	.load-rate {
		color: var(--text-muted);
	}

	/* Density table */
	.density-table {
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
		font-size: 0.82rem;
	}

	.density-header-row,
	.density-row {
		display: grid;
		grid-template-columns: 1.2fr 0.8fr 1fr 1fr 1.2fr;
		padding: 10px 14px;
		gap: 8px;
		align-items: center;
	}

	.density-header-row {
		background: var(--surface-alt);
		color: var(--text-muted);
		font-weight: 700;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.density-row {
		border-top: 1px solid var(--border);
		color: var(--text);
	}

	.density-row:nth-child(even) {
		background: var(--surface);
	}

	/* Notes */
	.notes-text {
		font-size: 0.88rem;
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 12px 14px;
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
		background: var(--surface-alt);
	}
</style>

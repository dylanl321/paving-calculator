<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import { config } from '$lib/config';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let currentLog = $state<any>(data.todayLog);
	let entries = $state<any[]>([]);
	let entrySummary = $state<any>({ total_distance_ft: 0, total_tons: 0, total_loads: 0 });
	let showEntryForm = $state(false);
	let editingEntry = $state<any>(null);

	let entryForm = $state({
		entry_type: 'paving' as 'paving' | 'milling' | 'tack' | 'break' | 'delay' | 'note',
		timestamp: '',
		station_start: null as number | null,
		station_end: null as number | null,
		distance_ft: null as number | null,
		tons_placed: null as number | null,
		loads_count: null as number | null,
		lane: '',
		notes: ''
	});

	$effect(() => {
		if (data.todayLog) {
			currentLog = data.todayLog;
			loadLogDetails();
		}
	});

	async function loadLogDetails() {
		if (!currentLog) return;
		const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}`);
		if (res.ok) {
			const result = await res.json();
			entries = result.entries;
			entrySummary = result.summary;
		}
	}

	async function startLog() {
		const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs`, { method: 'POST' });
		if (res.ok) {
			const { log } = await res.json();
			currentLog = log;
			await invalidateAll();
		}
	}

	async function updateLog() {
		if (!currentLog) return;
		const updates = {
			weather_temp_f: currentLog.weather_temp_f,
			weather_conditions: currentLog.weather_conditions,
			wind_speed_mph: currentLog.wind_speed_mph,
			crew_count: currentLog.crew_count,
			start_time: currentLog.start_time,
			end_time: currentLog.end_time,
			notes: currentLog.notes
		};
		const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates)
		});
		if (res.ok) {
			await loadLogDetails();
		}
	}

	function openEntryForm() {
		const now = new Date();
		entryForm = {
			entry_type: 'paving',
			timestamp: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
			station_start: null,
			station_end: null,
			distance_ft: null,
			tons_placed: null,
			loads_count: null,
			lane: '',
			notes: ''
		};
		editingEntry = null;
		showEntryForm = true;
	}

	function editEntry(entry: any) {
		entryForm = {
			entry_type: entry.entry_type,
			timestamp: entry.timestamp,
			station_start: entry.station_start,
			station_end: entry.station_end,
			distance_ft: entry.distance_ft,
			tons_placed: entry.tons_placed,
			loads_count: entry.loads_count,
			lane: entry.lane || '',
			notes: entry.notes || ''
		};
		editingEntry = entry;
		showEntryForm = true;
	}

	async function saveEntry() {
		if (!currentLog) return;

		if (editingEntry) {
			const res = await fetch(
				`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries/${editingEntry.id}`,
				{
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(entryForm)
				}
			);
			if (res.ok) {
				showEntryForm = false;
				await loadLogDetails();
			}
		} else {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(entryForm)
			});
			if (res.ok) {
				showEntryForm = false;
				await loadLogDetails();
			}
		}
	}

	async function deleteEntry(entryId: string) {
		if (!confirm('Delete this entry?')) return;
		const res = await fetch(
			`/api/job-sites/${data.jobSite.id}/logs/${currentLog.id}/entries/${entryId}`,
			{ method: 'DELETE' }
		);
		if (res.ok) {
			await loadLogDetails();
		}
	}

	function formatDistance(ft: number): string {
		if (ft >= 5280) {
			return `${(ft / 5280).toFixed(2)} mi`;
		}
		return `${ft.toLocaleString()} ft`;
	}

	function getEntryTypeIcon(type: string): string {
		const icons: Record<string, string> = {
			paving: '🛣️',
			milling: '🚜',
			tack: '💧',
			break: '☕',
			delay: '⏸️',
			note: '📝'
		};
		return icons[type] || '•';
	}

	function getEntryTypeColor(type: string): string {
		const colors: Record<string, string> = {
			paving: 'green',
			milling: 'blue',
			tack: 'cyan',
			break: 'gray',
			delay: 'red',
			note: 'yellow'
		};
		return colors[type] || 'gray';
	}

	$effect(() => {
		if (
			entryForm.station_start != null &&
			entryForm.station_end != null &&
			!entryForm.distance_ft
		) {
			entryForm.distance_ft = (entryForm.station_end - entryForm.station_start) * 100;
		}
	});
</script>

<svelte:head>
	<title>Daily Log — {data.jobSite.name} — {config.app.name}</title>
</svelte:head>

<div class="dashboard">
	<header class="topbar">
		<a href="/dashboard" class="logo-link">
			<img src="/icons/icon-192.png" alt="Paverate" />
			<div class="topbar-content">
				<h1>{config.app.name}</h1>
			</div>
		</a>
		<div class="topbar-actions">
			<ThemeToggle />
			<UserMenu />
		</div>
	</header>

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
		<span>Daily Log</span>
	</div>

	<div class="page-header">
		<div>
			<h2 class="page-title">Daily Log</h2>
			<p class="page-subtitle">{new Date(data.today).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
		</div>
		<a href="/dashboard/job-sites/{data.jobSite.id}/log/history" class="btn-secondary">
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
				<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
				<line x1="16" y1="2" x2="16" y2="6"></line>
				<line x1="8" y1="2" x2="8" y2="6"></line>
				<line x1="3" y1="10" x2="21" y2="10"></line>
			</svg>
			History
		</a>
	</div>

	{#if data.summary.total_distance_ft > 0}
		<div class="project-summary">
			<h3>Project to Date</h3>
			<div class="summary-stat">
				<span class="stat-value">{formatDistance(data.summary.total_distance_ft)}</span>
				<span class="stat-label">Distance</span>
			</div>
			<div class="summary-stat">
				<span class="stat-value">{data.summary.total_tons.toLocaleString()} tons</span>
				<span class="stat-label">Material Placed</span>
			</div>
			<div class="summary-stat">
				<span class="stat-value">{data.summary.total_days} days</span>
				<span class="stat-label">Work Days</span>
			</div>
		</div>
	{/if}

	{#if !currentLog}
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
				<line x1="12" y1="18" x2="12" y2="12"></line>
				<line x1="9" y1="15" x2="15" y2="15"></line>
			</svg>
			<h4>No log started for today</h4>
			<p>Start today's log to track production and site conditions</p>
			<button class="btn-primary" style="margin-top: 16px;" onclick={startLog}>
				Start Today's Log
			</button>
		</div>
	{:else}
		<section class="section">
			<h3>Site Conditions</h3>
			<div class="conditions-grid">
				<div class="field-compact">
					<label for="temp">Temp (°F)</label>
					<input type="number" id="temp" bind:value={currentLog.weather_temp_f} onblur={updateLog} />
				</div>
				<div class="field-compact">
					<label for="conditions">Conditions</label>
					<select id="conditions" bind:value={currentLog.weather_conditions} onchange={updateLog}>
						<option value={null}>—</option>
						<option value="clear">Clear</option>
						<option value="cloudy">Cloudy</option>
						<option value="rain">Rain</option>
						<option value="wind">Wind</option>
						<option value="fog">Fog</option>
					</select>
				</div>
				<div class="field-compact">
					<label for="wind">Wind (mph)</label>
					<input type="number" id="wind" bind:value={currentLog.wind_speed_mph} onblur={updateLog} />
				</div>
				<div class="field-compact">
					<label for="crew">Crew</label>
					<input type="number" id="crew" bind:value={currentLog.crew_count} onblur={updateLog} />
				</div>
				<div class="field-compact">
					<label for="start">Start</label>
					<input type="time" id="start" bind:value={currentLog.start_time} onblur={updateLog} />
				</div>
				<div class="field-compact">
					<label for="end">End</label>
					<input type="time" id="end" bind:value={currentLog.end_time} onblur={updateLog} />
				</div>
			</div>
		</section>

		{#if entrySummary.total_distance_ft > 0 || entrySummary.total_tons > 0}
			<div class="today-summary">
				<div class="summary-item">
					<span class="summary-label">Today</span>
					<span class="summary-value"
						>{formatDistance(entrySummary.total_distance_ft)} | {entrySummary.total_tons.toFixed(
							1
						)} tons | {entrySummary.total_loads} loads</span
					>
				</div>
			</div>
		{/if}

		<section class="section">
			<div class="section-header">
				<h3>Timeline</h3>
			</div>

			{#if entries.length === 0}
				<div class="empty-state-small">
					<p>No entries yet. Tap the + button to add your first entry.</p>
				</div>
			{:else}
				<div class="timeline">
					{#each entries as entry}
						<div class="timeline-entry entry-type-{getEntryTypeColor(entry.entry_type)}">
							<div class="entry-time">{entry.timestamp}</div>
							<div class="entry-icon">{getEntryTypeIcon(entry.entry_type)}</div>
							<div class="entry-content">
								<div class="entry-header">
									<span class="entry-type">{entry.entry_type}</span>
									{#if entry.lane}
										<span class="entry-lane">{entry.lane}</span>
									{/if}
								</div>
								<div class="entry-details">
									{#if entry.station_start != null && entry.station_end != null}
										<span>Sta {entry.station_start.toFixed(2)} → {entry.station_end.toFixed(2)}</span
										>
									{/if}
									{#if entry.distance_ft}
										<span>{formatDistance(entry.distance_ft)}</span>
									{/if}
									{#if entry.tons_placed}
										<span>{entry.tons_placed.toFixed(1)} tons</span>
									{/if}
									{#if entry.loads_count}
										<span>{entry.loads_count} loads</span>
									{/if}
									{#if entry.tack_gallons}
										<span>{entry.tack_gallons.toFixed(1)} gal tack</span>
									{/if}
								</div>
								{#if entry.notes}
									<div class="entry-notes">{entry.notes}</div>
								{/if}
								<div class="entry-actions">
									<button class="btn-icon" onclick={() => editEntry(entry)}>Edit</button>
									<button class="btn-icon" onclick={() => deleteEntry(entry.id)}>Delete</button>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

{#if currentLog && !showEntryForm}
	<button class="fab" onclick={openEntryForm}>
		<svg
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<line x1="12" y1="5" x2="12" y2="19"></line>
			<line x1="5" y1="12" x2="19" y2="12"></line>
		</svg>
	</button>
{/if}

{#if showEntryForm}
	<div class="modal-overlay" onclick={() => (showEntryForm = false)}>
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h3>{editingEntry ? 'Edit Entry' : 'Add Entry'}</h3>
				<button class="btn-icon" onclick={() => (showEntryForm = false)}>✕</button>
			</div>

			<div class="modal-body">
				<div class="field-compact">
					<label for="entry-type">Type</label>
					<select id="entry-type" bind:value={entryForm.entry_type}>
						<option value="paving">Paving</option>
						<option value="milling">Milling</option>
						<option value="tack">Tack</option>
						<option value="break">Break</option>
						<option value="delay">Delay</option>
						<option value="note">Note</option>
					</select>
				</div>

				<div class="field-compact">
					<label for="entry-time">Time</label>
					<input type="time" id="entry-time" bind:value={entryForm.timestamp} />
				</div>

				<div class="field-row">
					<div class="field-compact">
						<label for="sta-start">Station Start</label>
						<input type="number" id="sta-start" bind:value={entryForm.station_start} step="0.01" />
					</div>
					<div class="field-compact">
						<label for="sta-end">Station End</label>
						<input type="number" id="sta-end" bind:value={entryForm.station_end} step="0.01" />
					</div>
				</div>

				<div class="field-compact">
					<label for="distance">Distance (ft)</label>
					<input type="number" id="distance" bind:value={entryForm.distance_ft} />
				</div>

				<div class="field-row">
					<div class="field-compact">
						<label for="tons">Tons</label>
						<input type="number" id="tons" bind:value={entryForm.tons_placed} step="0.1" />
					</div>
					<div class="field-compact">
						<label for="loads">Loads</label>
						<input type="number" id="loads" bind:value={entryForm.loads_count} />
					</div>
				</div>

				<div class="field-compact">
					<label for="lane">Lane</label>
					<input type="text" id="lane" bind:value={entryForm.lane} placeholder="e.g., left, right" />
				</div>

				<div class="field-compact">
					<label for="notes">Notes</label>
					<textarea id="notes" bind:value={entryForm.notes} rows="3"></textarea>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn-secondary" onclick={() => (showEntryForm = false)}>Cancel</button>
				<button class="btn-primary" onclick={saveEntry}>
					{editingEntry ? 'Update' : 'Add'} Entry
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.dashboard {
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 12px 16px calc(80px + env(safe-area-inset-bottom));
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 6px 4px 14px;
	}

	.logo-link {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.topbar img {
		width: 40px;
		height: 40px;
		border-radius: 10px;
	}

	.topbar-content h1 {
		font-size: 1.35rem;
		letter-spacing: 0.5px;
		margin: 0;
	}

	.topbar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
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

	.btn-icon {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 0.85rem;
		cursor: pointer;
		padding: 4px 8px;
	}

	.btn-icon:hover {
		color: var(--accent);
	}

	.project-summary {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 24px;
	}

	.project-summary h3 {
		margin: 0 0 16px;
		font-size: 1rem;
		color: var(--text-muted);
	}

	.summary-stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}

	.stat-value {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent);
	}

	.stat-label {
		font-size: 0.85rem;
		color: var(--text-muted);
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

	.empty-state-small {
		text-align: center;
		padding: 32px 20px;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.section {
		margin-bottom: 32px;
	}

	.section h3 {
		margin: 0 0 16px;
		font-size: 1.2rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.conditions-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.field-compact {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field-compact label {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.field-compact input,
	.field-compact select,
	.field-compact textarea {
		min-height: 48px;
		padding: 0 12px;
		font-size: 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
	}

	.field-compact textarea {
		padding: 12px;
		resize: vertical;
		font-family: inherit;
	}

	.field-row {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
	}

	.today-summary {
		background: var(--good);
		color: var(--accent-text);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 24px;
		font-weight: 600;
	}

	.summary-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.summary-label {
		font-size: 0.8rem;
		opacity: 0.9;
	}

	.summary-value {
		font-size: 1rem;
	}

	.timeline {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.timeline-entry {
		display: grid;
		grid-template-columns: 60px 40px 1fr;
		gap: 12px;
		align-items: start;
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 4px solid var(--accent);
		border-radius: var(--radius);
	}

	.entry-type-green {
		border-left-color: var(--good);
	}

	.entry-type-blue {
		border-left-color: #3b82f6;
	}

	.entry-type-cyan {
		border-left-color: #06b6d4;
	}

	.entry-type-gray {
		border-left-color: var(--text-muted);
	}

	.entry-type-red {
		border-left-color: #ef4444;
	}

	.entry-type-yellow {
		border-left-color: #eab308;
	}

	.entry-time {
		font-size: 0.85rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.entry-icon {
		font-size: 1.5rem;
	}

	.entry-content {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.entry-header {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.entry-type {
		font-weight: 600;
		text-transform: capitalize;
	}

	.entry-lane {
		font-size: 0.75rem;
		padding: 2px 8px;
		background: var(--surface-alt);
		border-radius: 999px;
		color: var(--text-muted);
	}

	.entry-details {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.entry-details span {
		white-space: nowrap;
	}

	.entry-notes {
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.entry-actions {
		display: flex;
		gap: 8px;
		margin-top: 4px;
	}

	.fab {
		position: fixed;
		bottom: calc(24px + env(safe-area-inset-bottom));
		right: 24px;
		width: 56px;
		height: 56px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: 50%;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: transform 0.2s;
	}

	.fab:hover {
		transform: scale(1.05);
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: flex-end;
		z-index: 1000;
		padding: 0;
	}

	.modal {
		width: 100%;
		max-width: var(--maxw);
		margin: 0 auto;
		background: var(--bg);
		border-radius: var(--radius) var(--radius) 0 0;
		max-height: 90vh;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h3 {
		margin: 0;
		font-size: 1.3rem;
	}

	.modal-body {
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.modal-footer {
		display: flex;
		gap: 12px;
		padding: 20px;
		border-top: 1px solid var(--border);
	}

	.modal-footer .btn-secondary {
		flex: 1;
	}

	.modal-footer .btn-primary {
		flex: 2;
	}

	@media (min-width: 768px) {
		.modal-overlay {
			align-items: center;
		}

		.modal {
			border-radius: var(--radius);
			max-height: 80vh;
		}

		.conditions-grid {
			grid-template-columns: repeat(3, 1fr);
		}
	}
</style>

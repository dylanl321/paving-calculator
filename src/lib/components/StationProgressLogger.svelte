<script lang="ts">
	import { toastStore } from '$lib/stores/toast';
	import GpsStationButton from '$lib/components/GpsStationButton.svelte';
	import { formatStation, type RouteWaypoint } from '$lib/services/gpsStation';

	interface Props {
		jobSiteId: string;
		logId: string;
		waypoints?: RouteWaypoint[];
		onLogged?: () => void;
	}

	let { jobSiteId, logId, waypoints = [], onLogged }: Props = $props();

	// Form state
	let stationStart = $state<number | null>(null);
	let stationEnd = $state<number | null>(null);
	let tonsPlaced = $state<number | null>(null);
	let lane = $state('');
	let notes = $state('');
	let isSubmitting = $state(false);

	// Recent history (last 5 entries)
	let recentEntries = $state<any[]>([]);

	// Computed distance
	let distanceFt = $derived(
		stationStart != null && stationEnd != null ? Math.abs(stationEnd - stationStart) * 100 : null
	);

	// Load recent paving entries for today
	async function loadRecentEntries() {
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}`);
			if (res.ok) {
				const result = await res.json();
				// Filter paving entries and take last 5
				recentEntries = (result.entries || [])
					.filter((e: any) => e.entry_type === 'paving')
					.slice(-5);
			}
		} catch {
			// Failed to load recent entries (non-fatal)
		}
	}

	// Load recent entries on mount
	$effect(() => {
		if (logId) {
			loadRecentEntries();
		}
	});

	async function handleSubmit() {
		if (stationStart == null || stationEnd == null) {
			toastStore.error('Please enter both start and end stations');
			return;
		}

		if (distanceFt == null || distanceFt <= 0) {
			toastStore.error('Distance must be greater than zero');
			return;
		}

		isSubmitting = true;

		try {
			const now = new Date();
			const timestamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

			const payload: any = {
				entry_type: 'paving',
				timestamp,
				station_start: stationStart,
				station_end: stationEnd,
				distance_ft: distanceFt
			};

			if (tonsPlaced != null && tonsPlaced > 0) {
				payload.tons_placed = tonsPlaced;
			}
			if (lane.trim()) {
				payload.lane = lane.trim();
			}
			if (notes.trim()) {
				payload.notes = notes.trim();
			}

			const res = await fetch(`/api/job-sites/${jobSiteId}/logs/${logId}/entries`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				throw new Error('Failed to log pass');
			}

			// Success: show toast and clear form
			toastStore.success(
				`Pass logged: Sta ${formatStation(stationStart)} → ${formatStation(stationEnd)} (${distanceFt.toLocaleString()} ft)`
			);

			// Clear station fields (keep lane/tons for convenience)
			stationStart = null;
			stationEnd = null;
			notes = '';

			// Reload recent entries
			await loadRecentEntries();

			// Notify parent
			onLogged?.();
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to log pass');
		} finally {
			isSubmitting = false;
		}
	}

	function formatDistance(ft: number): string {
		if (ft >= 5280) {
			return `${(ft / 5280).toFixed(2)} mi`;
		}
		return `${ft.toLocaleString()} ft`;
	}
</script>

<div class="station-logger-card">
	<h3 class="card-title">Quick Pass Entry</h3>

	<div class="form-grid">
		<div class="station-input-group">
			<label for="from-station">From Station</label>
			<div class="input-with-gps">
				<input
					type="number"
					id="from-station"
					bind:value={stationStart}
					step="0.01"
					placeholder="0.00"
					class="station-input"
				/>
				<GpsStationButton
					{waypoints}
					label="GPS"
					compact
					onDetected={(sta) => {
						stationStart = sta;
					}}
				/>
			</div>
		</div>

		<div class="station-input-group">
			<label for="to-station">To Station</label>
			<div class="input-with-gps">
				<input
					type="number"
					id="to-station"
					bind:value={stationEnd}
					step="0.01"
					placeholder="0.00"
					class="station-input"
				/>
				<GpsStationButton
					{waypoints}
					label="GPS"
					compact
					onDetected={(sta) => {
						stationEnd = sta;
					}}
				/>
			</div>
		</div>
	</div>

	{#if distanceFt != null && distanceFt > 0}
		<div class="distance-preview">= {formatDistance(distanceFt)}</div>
	{/if}

	<div class="form-row">
		<div class="field-compact">
			<label for="tons">Tons Placed</label>
			<input
				type="number"
				id="tons"
				bind:value={tonsPlaced}
				step="0.1"
				placeholder="Optional"
				class="input-standard"
			/>
		</div>

		<div class="field-compact">
			<label for="lane-quick">Lane</label>
			<input
				type="text"
				id="lane-quick"
				bind:value={lane}
				placeholder="e.g., left"
				class="input-standard"
			/>
		</div>
	</div>

	<div class="field-compact">
		<label for="notes-quick">Notes</label>
		<input type="text" id="notes-quick" bind:value={notes} placeholder="Optional" class="input-standard" />
	</div>

	<button class="log-pass-btn" onclick={handleSubmit} disabled={isSubmitting}>
		{isSubmitting ? 'Logging...' : 'LOG PASS'}
	</button>

	{#if recentEntries.length > 0}
		<div class="history-strip">
			<div class="history-title">Recent Passes</div>
			<div class="history-scroll">
				{#each recentEntries as entry}
					<div class="history-item">
						<div class="history-stations">
							Sta {entry.station_start != null ? formatStation(entry.station_start) : '?'} →
							{entry.station_end != null ? formatStation(entry.station_end) : '?'}
						</div>
						{#if entry.tons_placed}
							<div class="history-tons">{entry.tons_placed.toFixed(1)}T</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.station-logger-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 24px;
	}

	.card-title {
		margin: 0 0 20px;
		font-size: 1.2rem;
		font-weight: 600;
		color: var(--text);
	}

	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		margin-bottom: 12px;
	}

	.station-input-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.station-input-group label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.input-with-gps {
		display: flex;
		gap: 6px;
		align-items: stretch;
	}

	.station-input {
		flex: 1;
		min-width: 0;
		min-height: 56px;
		padding: 0 16px;
		font-size: 1.25rem;
		font-weight: 600;
		background: var(--bg);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		transition: border-color 0.2s;
	}

	.station-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.distance-preview {
		text-align: center;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--accent);
		margin-bottom: 16px;
		padding: 8px;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin-bottom: 12px;
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

	.input-standard {
		min-height: 48px;
		padding: 0 12px;
		font-size: 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
	}

	.input-standard:focus {
		outline: none;
		border-color: var(--accent);
	}

	.log-pass-btn {
		width: 100%;
		min-height: 56px;
		padding: 0 24px;
		background: var(--good);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 1px;
		cursor: pointer;
		transition: opacity 0.2s;
		margin-top: 8px;
	}

	.log-pass-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.log-pass-btn:disabled {
		cursor: not-allowed;
		opacity: 0.6;
	}

	.history-strip {
		margin-top: 20px;
		padding-top: 20px;
		border-top: 1px solid var(--border);
	}

	.history-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 12px;
	}

	.history-scroll {
		display: flex;
		gap: 12px;
		overflow-x: auto;
		padding-bottom: 4px;
		-webkit-overflow-scrolling: touch;
		scrollbar-width: thin;
		scrollbar-color: var(--border) transparent;
	}

	.history-scroll::-webkit-scrollbar {
		height: 6px;
	}

	.history-scroll::-webkit-scrollbar-track {
		background: transparent;
	}

	.history-scroll::-webkit-scrollbar-thumb {
		background: var(--border);
		border-radius: 3px;
	}

	.history-item {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		min-width: 160px;
	}

	.history-stations {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
	}

	.history-tons {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	@media (min-width: 768px) {
		.station-logger-card {
			max-width: 600px;
		}
	}
</style>

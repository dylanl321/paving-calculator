<script lang="ts">
	/**
	 * MapStationPicker — map-v2 version of the Leaflet MapStationPicker.
	 * Uses MapLibre GL JS via MapView. Tap on the route to snap to a station.
	 */
	import { MapView } from '$lib/components/map-v2';
	import { TerminusEditController, type TerminusEditApi } from '$lib/components/map-v2/editors';
	import { formatStation } from '$lib/services/gpsStation';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface Props {
		waypoints?: Waypoint[];
		stationStart?: number | null;
		stationEnd?: number | null;
		height?: string;
		onPick?: (field: 'start' | 'end', station: number) => void;
	}

	let {
		waypoints = [],
		stationStart = $bindable(null),
		stationEnd = $bindable(null),
		height = '260px',
		onPick
	}: Props = $props();

	type ActiveField = 'start' | 'end' | null;
	let terminusApi = $state<TerminusEditApi | null>(null);

	// The controller speaks begin/end; this picker speaks start/end. Map between.
	const activeField = $derived<ActiveField>(
		terminusApi == null ? 'start' : terminusApi.activeField === 'begin' ? 'start' : terminusApi.activeField
	);
	const flashMessage = $derived(terminusApi?.flashMessage ?? '');

	// Compute map bounds from waypoints
	const mapBounds = $derived.by(() => {
		if (waypoints.length === 0) return undefined;
		const lats = waypoints.map((w) => w.lat);
		const lngs = waypoints.map((w) => w.lng);
		return [
			[Math.min(...lats), Math.min(...lngs)],
			[Math.max(...lats), Math.max(...lngs)]
		] as [[number, number], [number, number]];
	});

	// Station summary text
	const summaryText = $derived.by(() => {
		if (stationStart == null || stationEnd == null) return '';
		const distFt = Math.abs(stationEnd - stationStart) * 100;
		return `Start: ${formatStation(stationStart)}  \u2192  End: ${formatStation(stationEnd)}  (${distFt.toFixed(0)} ft)`;
	});

	// Overlay pill text
	const overlayText = $derived.by(() => {
		if (flashMessage) return flashMessage;
		if (activeField === 'start') return 'Tap to set START station';
		if (activeField === 'end') return 'Tap to set END station';
		return 'Tap a field button to continue';
	});

	function toggleField(field: 'start' | 'end') {
		const target = field === 'start' ? 'begin' : 'end';
		terminusApi?.setActiveField(activeField === field ? null : target);
	}

	function clearStations() {
		terminusApi?.clear();
	}

	function handlePick(field: 'begin' | 'end', station: number) {
		onPick?.(field === 'begin' ? 'start' : 'end', station);
	}

</script>

{#if waypoints.length < 2}
	<div class="no-route-placeholder">
		<span class="no-route-icon">🗺</span>
		<p>No route defined — draw the road alignment first</p>
	</div>
{:else}
	<div class="map-station-picker">
		<!-- Field toggle buttons -->
		<div class="toggle-row">
			<button
				type="button"
				class="toggle-btn {activeField === 'start' ? 'toggle-btn--active' : ''}"
				onclick={() => toggleField('start')}
			>
				<span class="toggle-dot toggle-dot--start"></span>
				Set Start
				{#if stationStart != null}
					<span class="toggle-value">{formatStation(stationStart)}</span>
				{/if}
			</button>

			<button
				type="button"
				class="toggle-btn {activeField === 'end' ? 'toggle-btn--active' : ''}"
				onclick={() => toggleField('end')}
			>
				<span class="toggle-dot toggle-dot--end"></span>
				Set End
				{#if stationEnd != null}
					<span class="toggle-value">{formatStation(stationEnd)}</span>
				{/if}
			</button>

			{#if stationStart != null || stationEnd != null}
				<button type="button" class="clear-btn" onclick={clearStations}>
					Clear
				</button>
			{/if}
		</div>

		<!-- Map with overlay pill -->
		<div class="map-wrap" style="height: {height}">
			<MapView bounds={mapBounds} {height}>
				{#snippet layers()}
					<TerminusEditController
						{waypoints}
						bind:beginStation={stationStart}
						bind:endStation={stationEnd}
						beginColor="#f59e0b"
						endColor="#3b82f6"
						active={true}
						onPick={handlePick}
						bind:api={terminusApi}
					/>
				{/snippet}
			</MapView>

			<!-- Overlay pill -->
			<div class="map-overlay-pill {flashMessage ? 'map-overlay-pill--flash' : ''}">
				{overlayText}
			</div>
		</div>

		<!-- Summary bar -->
		{#if summaryText}
			<div class="station-summary">{summaryText}</div>
		{/if}
	</div>
{/if}

<style>
	.no-route-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 32px 16px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		text-align: center;
	}

	.no-route-icon {
		font-size: 2rem;
	}

	.no-route-placeholder p {
		margin: 0;
		font-size: 0.9rem;
	}

	.map-station-picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.toggle-row {
		display: flex;
		gap: 8px;
		align-items: center;
	}

	.toggle-btn {
		flex: 1;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 0 12px;
		background: var(--surface);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s, background 0.15s;
	}

	.toggle-btn--active {
		border-color: var(--accent);
		color: var(--text);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
	}

	.toggle-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.toggle-dot--start {
		background: #f59e0b;
	}

	.toggle-dot--end {
		background: #3b82f6;
	}

	.toggle-value {
		font-size: 0.75rem;
		color: var(--accent);
		font-weight: 700;
		margin-left: 2px;
	}

	.clear-btn {
		min-height: 48px;
		padding: 0 14px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: color 0.15s, border-color 0.15s;
	}

	.clear-btn:hover {
		color: var(--text);
		border-color: var(--text-muted);
	}

	.map-wrap {
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
	}

	.map-overlay-pill {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		pointer-events: none;
		background: rgba(0, 0, 0, 0.72);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 5px 14px;
		border-radius: 20px;
		white-space: nowrap;
		letter-spacing: 0.3px;
		transition: opacity 0.2s;
	}

	.map-overlay-pill--flash {
		background: rgba(239, 68, 68, 0.9);
	}

	.station-summary {
		text-align: center;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--accent);
		padding: 6px 8px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border-radius: var(--radius);
	}
</style>

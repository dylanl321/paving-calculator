<script lang="ts">
	/**
	 * MapStationPicker — map-v2 version of the Leaflet MapStationPicker.
	 * Uses MapLibre GL JS via MapView. Tap on the route to snap to a station.
	 */
	import { MapView, MapPolyline, MapMarker } from '$lib/components/map-v2';
	import { coordinateToStation, stationToCoordinate } from '$lib/services/mapUtils';
	import { formatStation } from '$lib/services/gpsStation';
	import type { Map as MapLibreMap } from 'maplibre-gl';

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
	let activeField = $state<ActiveField>('start');
	let flashMessage = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;
	let mapInstance = $state<MapLibreMap | null>(null);

	// Polyline points from waypoints
	const routePoints = $derived(waypoints.map((w) => [w.lat, w.lng] as [number, number]));

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

	// Snapped coordinates for start/end markers
	const startCoord = $derived(
		stationStart != null && waypoints.length >= 2
			? stationToCoordinate(stationStart, waypoints)
			: null
	);
	const endCoord = $derived(
		stationEnd != null && waypoints.length >= 2
			? stationToCoordinate(stationEnd, waypoints)
			: null
	);

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

	function flash(msg: string) {
		flashMessage = msg;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			flashMessage = '';
		}, 1200);
	}

	function handleMapReady(map: MapLibreMap) {
		mapInstance = map;
		map.on('click', (e) => {
			if (!activeField) return;
			const coord = { lat: e.lngLat.lat, lng: e.lngLat.lng };
			const station = coordinateToStation(coord, waypoints);
			if (station === null) {
				flash('Tap closer to the route');
				return;
			}
			if (activeField === 'start') {
				stationStart = station;
				onPick?.('start', station);
				activeField = 'end';
			} else {
				stationEnd = station;
				onPick?.('end', station);
				activeField = null;
			}
		});
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
				onclick={() => { activeField = activeField === 'start' ? null : 'start'; }}
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
				onclick={() => { activeField = activeField === 'end' ? null : 'end'; }}
			>
				<span class="toggle-dot toggle-dot--end"></span>
				Set End
				{#if stationEnd != null}
					<span class="toggle-value">{formatStation(stationEnd)}</span>
				{/if}
			</button>

			{#if stationStart != null || stationEnd != null}
				<button
					type="button"
					class="clear-btn"
					onclick={() => { stationStart = null; stationEnd = null; activeField = 'start'; }}
				>
					Clear
				</button>
			{/if}
		</div>

		<!-- Map with overlay pill -->
		<div class="map-wrap" style="height: {height}">
			<MapView bounds={mapBounds} {height} onready={handleMapReady}>
				{#snippet layers()}
					<!-- Route alignment polyline in amber -->
					<MapPolyline
						id="station-route"
						coordinates={routePoints}
						color="#f59e0b"
						width={4}
						opacity={0.9}
					/>
					<!-- Start station marker (amber) -->
					{#if startCoord}
						<MapMarker
							lat={startCoord[0]}
							lng={startCoord[1]}
							color="#f59e0b"
							label="S"
							popupHtml="<b>Start: {formatStation(stationStart!)}</b>"
						/>
					{/if}
					<!-- End station marker (blue) -->
					{#if endCoord}
						<MapMarker
							lat={endCoord[0]}
							lng={endCoord[1]}
							color="#3b82f6"
							label="E"
							popupHtml="<b>End: {formatStation(stationEnd!)}</b>"
						/>
					{/if}
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

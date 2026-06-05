<script lang="ts">
	/**
	 * TerminusPicker — set a project's BEGIN and END termini by clicking the
	 * actual road. Every click/marker is snapped to the route centerline via the
	 * shared projection (coordinateToStation/stationToCoordinate), so points can
	 * only ever land ON the road — no free/off-road pins. Roads-only by design.
	 *
	 * Built on map-v2 MapView (MapLibre). Mirrors MapStationPicker's UX but is
	 * framed around named termini (Begin/End) and emits both the station offset
	 * and the snapped [lat, lng] coordinate.
	 */
	import { MapView, MapPolyline, MapMarker } from '$lib/components/map-v2';
	import { coordinateToStation, stationToCoordinate } from '$lib/services/mapUtils';
	import { formatStation } from '$lib/services/gpsStation';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { ParsedTerminus } from '$lib/server/terminus-parser.js';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface Props {
		/** Route centerline the termini snap to ([lat,lng] objects). */
		waypoints?: Waypoint[];
		/** Begin terminus as a station offset along the route (ft / 100). */
		beginStation?: number | null;
		/** End terminus as a station offset along the route. */
		endStation?: number | null;
		/** Parsed terminus text shown as a hint (e.g. "THE FLORIDA STATE LINE"). */
		beginLabel?: string | null;
		endLabel?: string | null;
		/** Parsed terminus structures for better display. */
		beginParsed?: ParsedTerminus | null;
		endParsed?: ParsedTerminus | null;
		height?: string;
		/** Fired when a terminus is set: station + snapped [lat,lng]. */
		onPick?: (field: 'begin' | 'end', station: number, coord: [number, number]) => void;
	}

	let {
		waypoints = [],
		beginStation = $bindable(null),
		endStation = $bindable(null),
		beginLabel = null,
		endLabel = null,
		beginParsed = null,
		endParsed = null,
		height = '320px',
		onPick
	}: Props = $props();

	type ActiveField = 'begin' | 'end' | null;
	let activeField = $state<ActiveField>('begin');
	let flashMessage = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;
	let mapInstance = $state<MapLibreMap | null>(null);

	const hasRoute = $derived(waypoints.length >= 2);
	const routePoints = $derived(waypoints.map((w) => [w.lat, w.lng] as [number, number]));

	const mapBounds = $derived.by(() => {
		if (waypoints.length === 0) return undefined;
		const lats = waypoints.map((w) => w.lat);
		const lngs = waypoints.map((w) => w.lng);
		return [
			[Math.min(...lats), Math.min(...lngs)],
			[Math.max(...lats), Math.max(...lngs)]
		] as [[number, number], [number, number]];
	});

	const beginCoord = $derived(
		beginStation != null && hasRoute ? stationToCoordinate(beginStation, waypoints) : null
	);
	const endCoord = $derived(
		endStation != null && hasRoute ? stationToCoordinate(endStation, waypoints) : null
	);

	const routeStartStation = $derived(hasRoute ? coordinateToStation(waypoints[0], waypoints) : null);
	const routeEndStation = $derived(
		hasRoute ? coordinateToStation(waypoints[waypoints.length - 1], waypoints) : null
	);

	const summaryText = $derived.by(() => {
		if (beginStation == null || endStation == null) return '';
		const distFt = Math.abs(endStation - beginStation) * 100;
		return `Start ${formatStation(beginStation)}  \u2192  End ${formatStation(endStation)}  (${distFt.toFixed(0)} ft)`;
	});

	const overlayText = $derived.by(() => {
		if (flashMessage) return flashMessage;
		if (activeField === 'begin') return 'Tap the road to set the project START';
		if (activeField === 'end') return 'Tap the road to set the project END';
		return 'Choose Start or End, then tap the road';
	});

	function flash(msg: string) {
		flashMessage = msg;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			flashMessage = '';
		}, 1400);
	}

	function setTerminus(field: 'begin' | 'end', lat: number, lng: number): boolean {
		const station = coordinateToStation({ lat, lng }, waypoints);
		if (station === null) {
			flash('Tap closer to the road');
			return false;
		}
		// Snap back to the centerline so the marker always sits ON the road.
		const snapped = stationToCoordinate(station, waypoints);
		if (field === 'begin') {
			beginStation = station;
			activeField = 'end';
		} else {
			endStation = station;
			activeField = null;
		}
		if (snapped) onPick?.(field, station, snapped);
		return true;
	}

	function useFullRoute() {
		if (!hasRoute || routeStartStation == null || routeEndStation == null) return;
		beginStation = routeStartStation;
		endStation = routeEndStation;
		activeField = null;
		onPick?.('begin', routeStartStation, [waypoints[0].lat, waypoints[0].lng]);
		onPick?.('end', routeEndStation, [
			waypoints[waypoints.length - 1].lat,
			waypoints[waypoints.length - 1].lng
		]);
	}

	function handleMapReady(map: MapLibreMap) {
		mapInstance = map;
		map.on('click', (e) => {
			if (!activeField) return;
			setTerminus(activeField, e.lngLat.lat, e.lngLat.lng);
		});
	}
</script>

{#if !hasRoute}
	<div class="no-route-placeholder">
		<span class="no-route-icon" aria-hidden="true">🛣</span>
		<p>No road line yet — load a route or draw the road alignment first.</p>
	</div>
{:else}
	<div class="terminus-picker">
		<div class="plain-help">
			<strong>Project Start &amp; End</strong>
			<span>These are the limits you are paving along the saved road line. They snap onto the road.</span>
		</div>

		<div class="toggle-row">
			<button
				type="button"
				class="toggle-btn {activeField === 'begin' ? 'toggle-btn--active' : ''}"
				onclick={() => { activeField = activeField === 'begin' ? null : 'begin'; }}
			>
				<span class="toggle-dot toggle-dot--begin"></span>
				Set Start
				{#if beginStation != null}
					<span class="toggle-value">{formatStation(beginStation)}</span>
				{/if}
			</button>

			<button
				type="button"
				class="toggle-btn {activeField === 'end' ? 'toggle-btn--active' : ''}"
				onclick={() => { activeField = activeField === 'end' ? null : 'end'; }}
			>
				<span class="toggle-dot toggle-dot--end"></span>
				Set End
				{#if endStation != null}
					<span class="toggle-value">{formatStation(endStation)}</span>
				{/if}
			</button>

			{#if beginStation != null || endStation != null}
				<button
					type="button"
					class="clear-btn"
					onclick={() => { beginStation = null; endStation = null; activeField = 'begin'; }}
				>
					Clear
				</button>
			{/if}

			<button type="button" class="clear-btn clear-btn--accent" onclick={useFullRoute}>
				Use Full Route
			</button>
		</div>

		{#if beginLabel || endLabel || beginParsed || endParsed}
			<div class="terminus-hint">
				{#if beginLabel}
					<span><strong>Start:</strong> {beginLabel}</span>
					{#if beginParsed && beginParsed.type === 'intersection'}
						<span class="parsed-hint">Parsed as {beginParsed.summary}</span>
					{:else if beginParsed && beginParsed.type === 'milepost'}
						<span class="parsed-hint">Parsed as {beginParsed.summary}</span>
					{:else if beginParsed && beginParsed.type === 'landmark'}
						<span class="parsed-hint">Parsed as {beginParsed.summary}</span>
					{/if}
				{/if}
				{#if endLabel}
					<span><strong>End:</strong> {endLabel}</span>
					{#if endParsed && endParsed.type === 'intersection'}
						<span class="parsed-hint">Parsed as {endParsed.summary}</span>
					{:else if endParsed && endParsed.type === 'milepost'}
						<span class="parsed-hint">Parsed as {endParsed.summary}</span>
					{:else if endParsed && endParsed.type === 'landmark'}
						<span class="parsed-hint">Parsed as {endParsed.summary}</span>
					{/if}
				{/if}
			</div>
		{/if}

		<div class="map-wrap" style="height: {height}">
			<MapView bounds={mapBounds} {height} onready={handleMapReady}>
				{#snippet layers()}
					<MapPolyline
						id="terminus-route"
						coordinates={routePoints}
						color="#f59e0b"
						width={4}
						opacity={0.9}
					/>
					{#if beginCoord}
						<MapMarker
							lat={beginCoord[0]}
							lng={beginCoord[1]}
							color="#f2c037"
							label="S"
							popupHtml="<b>Start: {formatStation(beginStation!)}</b>"
						/>
					{/if}
					{#if endCoord}
						<MapMarker
							lat={endCoord[0]}
							lng={endCoord[1]}
							color="#3b82f6"
							label="E"
							popupHtml="<b>End: {formatStation(endStation!)}</b>"
						/>
					{/if}
				{/snippet}
			</MapView>

			<div class="map-overlay-pill {flashMessage ? 'map-overlay-pill--flash' : ''}">
				{overlayText}
			</div>
		</div>

		{#if summaryText}
			<div class="terminus-summary">{summaryText}</div>
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
		max-width: 320px;
	}

	.terminus-picker {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.plain-help {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--border));
		border-radius: var(--radius);
	}

	.plain-help strong {
		color: var(--text);
		font-size: 0.9rem;
	}

	.plain-help span {
		color: var(--text-muted);
		font-size: 0.82rem;
		line-height: 1.35;
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

	.toggle-dot--begin {
		background: #f2c037;
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

	.clear-btn--accent {
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
	}

	.clear-btn--accent:hover {
		color: var(--accent-text);
		background: var(--accent);
		border-color: var(--accent);
	}

	.terminus-hint {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.terminus-hint > span {
		display: block;
	}

	.parsed-hint {
		font-size: 0.75rem;
		color: #14b8a6;
		margin-left: 8px;
		font-weight: 500;
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

	.terminus-summary {
		text-align: center;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--accent);
		padding: 6px 8px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border-radius: var(--radius);
	}
</style>

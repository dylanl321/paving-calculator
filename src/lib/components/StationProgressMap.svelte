<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import L from 'leaflet';
	import 'leaflet/dist/leaflet.css';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface SitePin {
		id: string;
		name: string;
		status: 'active' | 'completed' | 'archived';
		latitude: number | null;
		longitude: number | null;
		location_description?: string | null;
	}

	interface ProgressEntry {
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		entry_type: string;
		lane: string | null;
	}

	interface Props {
		site: SitePin;
		waypoints: Waypoint[];
		numLanes?: number | null;
		laneWidthFt?: number | null;
		totalLengthFt?: number | null;
		height?: string;
	}

	let {
		site,
		waypoints,
		numLanes = null,
		laneWidthFt = null,
		totalLengthFt = null,
		height = '360px'
	}: Props = $props();

	let mapEl: HTMLDivElement;
	let mapInstance: L.Map | null = null;
	let progressEntries = $state<ProgressEntry[]>([]);
	let totalPavedFt = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let progressPolylines: L.Polyline[] = [];
	let routePolyline: L.Polyline | null = null;

	const hasRoute = $derived(waypoints.length >= 2);
	const hasPinned = $derived(site.latitude != null && site.longitude != null);

	// Stations use base-100 notation: station 1.5 = 150 ft from start
	function stationToFeet(station: number): number {
		return station * 100;
	}

	function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const R = 6371000;
		const phi1 = (lat1 * Math.PI) / 180;
		const phi2 = (lat2 * Math.PI) / 180;
		const dphi = ((lat2 - lat1) * Math.PI) / 180;
		const dlambda = ((lon2 - lon1) * Math.PI) / 180;
		const a =
			Math.sin(dphi / 2) * Math.sin(dphi / 2) +
			Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) * Math.sin(dlambda / 2);
		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	// Convert cumulative feet along waypoints to a [lat, lng] coordinate
	function feetToLatLng(targetFt: number, wps: Waypoint[]): [number, number] | null {
		if (wps.length < 2) return null;
		if (targetFt <= 0) return [wps[0].lat, wps[0].lng];

		let accumulated = 0;
		for (let i = 0; i < wps.length - 1; i++) {
			const segMeters = haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
			const segFt = segMeters * 3.28084;
			if (accumulated + segFt >= targetFt) {
				const fraction = (targetFt - accumulated) / segFt;
				const lat = wps[i].lat + fraction * (wps[i + 1].lat - wps[i].lat);
				const lng = wps[i].lng + fraction * (wps[i + 1].lng - wps[i].lng);
				return [lat, lng];
			}
			accumulated += segFt;
		}
		// Past end — return last waypoint
		return [wps[wps.length - 1].lat, wps[wps.length - 1].lng];
	}

	function totalRouteFt(wps: Waypoint[]): number {
		if (wps.length < 2) return 0;
		let meters = 0;
		for (let i = 0; i < wps.length - 1; i++) {
			meters += haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
		}
		return meters * 3.28084;
	}

	async function loadProgress() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/job-sites/${site.id}/logs/progress`);
			if (!res.ok) throw new Error('Failed to load progress');
			const data = await res.json();
			progressEntries = data.progress ?? [];
			totalPavedFt = data.total_paved_ft ?? 0;
		} catch (err) {
			error = 'Could not load progress data';
		} finally {
			loading = false;
		}
	}

	function drawProgress() {
		if (!mapInstance) return;
		// Remove old progress layers
		for (const pl of progressPolylines) {
			mapInstance.removeLayer(pl);
		}
		progressPolylines = [];

		for (const entry of progressEntries) {
			let startFt: number | null = null;
			let endFt: number | null = null;

			if (entry.station_start != null) {
				startFt = stationToFeet(entry.station_start);
			}
			if (entry.station_end != null) {
				endFt = stationToFeet(entry.station_end);
			} else if (startFt != null && entry.distance_ft != null) {
				endFt = startFt + entry.distance_ft;
			}

			if (startFt == null || endFt == null) continue;
			if (endFt <= startFt) continue;

			const startLL = feetToLatLng(startFt, waypoints);
			const endLL = feetToLatLng(endFt, waypoints);
			if (!startLL || !endLL) continue;

			// Build intermediate points along the route for this segment
			const segPoints: [number, number][] = [startLL];
			let accumulated = 0;
			for (let i = 0; i < waypoints.length - 1; i++) {
				const segMeters = haversineMeters(
					waypoints[i].lat,
					waypoints[i].lng,
					waypoints[i + 1].lat,
					waypoints[i + 1].lng
				);
				const segFt = segMeters * 3.28084;
				const segStart = accumulated;
				const segEnd = accumulated + segFt;
				// If this waypoint intermediate is within [startFt, endFt], include it
				if (segEnd > startFt && segStart < endFt) {
					const wpFt = accumulated + segFt;
					if (wpFt > startFt && wpFt < endFt) {
						segPoints.push([waypoints[i + 1].lat, waypoints[i + 1].lng]);
					}
				}
				accumulated += segFt;
			}
			segPoints.push(endLL);

			const pl = L.polyline(segPoints, {
				color: '#22c55e',
				weight: 7,
				opacity: 0.85,
				lineCap: 'round'
			}).addTo(mapInstance);

			progressPolylines.push(pl);
		}
	}

	function initMap() {
		if (!browser || !mapEl || (!hasRoute && !hasPinned)) return;

		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}

		mapInstance = L.map(mapEl, {
			zoomControl: true,
			attributionControl: true
		});

		L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		if (hasRoute) {
			// Draw the full planned route in gray
			routePolyline = L.polyline(
				waypoints.map((wp) => [wp.lat, wp.lng]),
				{ color: '#64748b', weight: 4, opacity: 0.6, dashArray: '6 4' }
			).addTo(mapInstance);

			// Draw road-width buffer if lane info available
			if (numLanes && laneWidthFt && numLanes > 0 && laneWidthFt > 0) {
				const totalWidthFt = numLanes * laneWidthFt;
				const totalWidthMeters = totalWidthFt * 0.3048;
				const bufferCoords = computeBufferPolygon(waypoints, totalWidthMeters);
				if (bufferCoords.length > 0) {
					L.polygon(bufferCoords, {
						color: 'rgba(100, 116, 139, 0.4)',
						fillColor: 'rgba(100, 116, 139, 0.1)',
						fillOpacity: 1,
						weight: 1
					}).addTo(mapInstance);
				}
			}

			// Fit map to route bounds
			const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lng]));
			mapInstance.fitBounds(bounds, { padding: [30, 30] });
		} else if (hasPinned) {
			mapInstance.setView([site.latitude as number, site.longitude as number], 15);
		}

		// Draw progress on top
		drawProgress();
	}

	function computeBufferPolygon(wps: Waypoint[], widthMeters: number): [number, number][] {
		if (wps.length < 2) return [];
		const halfWidth = widthMeters / 2;
		const leftSide: [number, number][] = [];
		const rightSide: [number, number][] = [];

		for (let i = 0; i < wps.length; i++) {
			const curr = wps[i];
			let perpAngle: number;
			if (i === 0) {
				const next = wps[i + 1];
				perpAngle = Math.atan2(next.lat - curr.lat, next.lng - curr.lng);
			} else if (i === wps.length - 1) {
				const prev = wps[i - 1];
				perpAngle = Math.atan2(curr.lat - prev.lat, curr.lng - prev.lng);
			} else {
				const prev = wps[i - 1];
				const next = wps[i + 1];
				const angle1 = Math.atan2(curr.lat - prev.lat, curr.lng - prev.lng);
				const angle2 = Math.atan2(next.lat - curr.lat, next.lng - curr.lng);
				perpAngle = (angle1 + angle2) / 2;
			}
			const latOffsetPerMeter = 1 / 111320;
			const lngOffsetPerMeter = 1 / (111320 * Math.cos((curr.lat * Math.PI) / 180));
			const perpLat = Math.sin(perpAngle + Math.PI / 2);
			const perpLng = Math.cos(perpAngle + Math.PI / 2);
			leftSide.push([
				curr.lat + perpLat * halfWidth * latOffsetPerMeter,
				curr.lng + perpLng * halfWidth * lngOffsetPerMeter
			]);
			rightSide.push([
				curr.lat - perpLat * halfWidth * latOffsetPerMeter,
				curr.lng - perpLng * halfWidth * lngOffsetPerMeter
			]);
		}
		return [...leftSide, ...rightSide.reverse()];
	}

	const routeTotalFt = $derived(totalRouteFt(waypoints));
	const effectiveTotalFt = $derived(
		totalLengthFt && totalLengthFt > 0 ? totalLengthFt : routeTotalFt
	);
	const pctComplete = $derived(
		effectiveTotalFt > 0 ? Math.min(Math.round((totalPavedFt / effectiveTotalFt) * 100), 100) : 0
	);

	onMount(async () => {
		await loadProgress();
		if (browser && (hasRoute || hasPinned)) {
			initMap();
		}
	});

	// Re-draw progress when data loads
	$effect(() => {
		if (!loading && mapInstance) {
			drawProgress();
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
	});
</script>

<div class="station-progress">
	{#if !hasRoute}
		<div class="empty-state">
			<svg
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
			</svg>
			<p>Draw a route first to see station-based progress.</p>
		</div>
	{:else}
		<div class="legend-bar">
			<span class="legend-label">
				{#if loading}
					Loading progress&hellip;
				{:else if error}
					<span class="legend-error">{error}</span>
				{:else if progressEntries.length === 0}
					No paving logged yet
				{:else}
					<span class="legend-paved">
						{totalPavedFt.toLocaleString()} ft paved
					</span>
					{#if effectiveTotalFt > 0}
						<span class="legend-of">of {effectiveTotalFt.toLocaleString()} ft</span>
						<span class="legend-pct">{pctComplete}%</span>
					{/if}
				{/if}
			</span>
			<span class="legend-swatch">
				<span class="swatch-paved" aria-label="Paved"></span>
				<span class="swatch-label">Paved</span>
				<span class="swatch-planned" aria-label="Planned"></span>
				<span class="swatch-label">Planned</span>
			</span>
		</div>

		<div class="map-wrap" style="height:{height}">
			<div bind:this={mapEl} class="map-el"></div>
			{#if loading}
				<div class="map-overlay-loading" aria-live="polite">Loading&hellip;</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.station-progress {
		width: 100%;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 32px 20px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-state svg {
		opacity: 0.4;
	}

	.empty-state p {
		margin: 0;
		font-size: 0.875rem;
	}

	.legend-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px) var(--radius-md, 12px) 0 0;
		border-bottom: none;
		flex-wrap: wrap;
	}

	.legend-label {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
		flex-wrap: wrap;
	}

	.legend-paved {
		font-weight: 700;
		color: var(--good, #22c55e);
	}

	.legend-of {
		color: var(--text-muted);
	}

	.legend-pct {
		font-weight: 700;
		color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, transparent);
		padding: 2px 8px;
		border-radius: 999px;
	}

	.legend-error {
		color: var(--warn, #ef4444);
	}

	.legend-swatch {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.swatch-paved {
		display: inline-block;
		width: 20px;
		height: 5px;
		background: var(--good);
		border-radius: 3px;
		opacity: 0.85;
	}

	.swatch-planned {
		display: inline-block;
		width: 20px;
		height: 3px;
		background: var(--text-muted);
		border-radius: 3px;
		opacity: 0.6;
	}

	.swatch-label {
		font-size: 0.72rem;
	}

	.map-wrap {
		position: relative;
		width: 100%;
		border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-el {
		width: 100%;
		height: 100%;
	}

	.map-el :global(.leaflet-pane) {
		z-index: 1;
	}
	.map-el :global(.leaflet-top),
	.map-el :global(.leaflet-bottom) {
		z-index: 2;
	}

	.map-overlay-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 600;
		z-index: 600;
		pointer-events: none;
	}

	@media (max-width: 640px) {
		.legend-bar {
			padding: 8px 12px;
			gap: 8px;
		}

		.legend-label {
			font-size: 0.8rem;
		}
	}
</style>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import L from 'leaflet';

	// Leaflet's CSS references .png assets via url(); load it browser-only so it
	// stays out of the SSR / Pages Functions bundle (esbuild has no .png loader).
	if (browser) import('leaflet/dist/leaflet.css');

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

	interface HeatEntry {
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		entry_type: string;
		lane: string | null;
		spread_rate_actual: number | null;
	}

	interface Props {
		site: SitePin;
		waypoints: Waypoint[];
		targetRate?: number | null;
		toleranceLbsSy?: number;
		height?: string;
	}

	let {
		site,
		waypoints,
		targetRate = null,
		toleranceLbsSy = 5,
		height = '360px'
	}: Props = $props();

	let mapEl: HTMLDivElement;
	let mapInstance: L.Map | null = null;
	let entries = $state<HeatEntry[]>([]);
	let loading = $state(true);
	let fetchError = $state<string | null>(null);
	let segmentPolylines: L.Polyline[] = [];
	let routePolyline: L.Polyline | null = null;

	const hasRoute = $derived(waypoints.length >= 2);
	const hasPinned = $derived(site.latitude != null && site.longitude != null);

	// Stations use base-100 notation: station 1.5 = 150 ft from start
	function stationToFeet(station: number): number {
		return station * 100;
	}

	// Format feet as station notation: 150ft -> "1+50"
	function feetToStation(ft: number): string {
		const whole = Math.floor(ft / 100);
		const remainder = Math.round(ft % 100);
		return `${whole}+${String(remainder).padStart(2, '0')}`;
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

		let cumFt = 0;
		for (let i = 0; i < wps.length - 1; i++) {
			const segFt = haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng) * 3.28084;
			if (cumFt + segFt >= targetFt) {
				const frac = (targetFt - cumFt) / segFt;
				const lat = wps[i].lat + frac * (wps[i + 1].lat - wps[i].lat);
				const lng = wps[i].lng + frac * (wps[i + 1].lng - wps[i].lng);
				return [lat, lng];
			}
			cumFt += segFt;
		}
		// Beyond end of route
		return [wps[wps.length - 1].lat, wps[wps.length - 1].lng];
	}

	// Compute total route length in feet
	function totalRouteFt(wps: Waypoint[]): number {
		let total = 0;
		for (let i = 0; i < wps.length - 1; i++) {
			total += haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng) * 3.28084;
		}
		return total;
	}

	type SegStatus = 'good' | 'warn' | 'bad' | 'nodata';

	function segmentStatus(spreadRate: number | null): SegStatus {
		if (spreadRate == null || targetRate == null) return 'nodata';
		const delta = Math.abs(spreadRate - targetRate);
		if (delta <= toleranceLbsSy) return 'good';
		if (delta <= toleranceLbsSy * 1.5) return 'warn';
		return 'bad';
	}

	const STATUS_COLOR: Record<SegStatus, string> = {
		good: '#22c55e',
		warn: '#f59e0b',
		bad: '#ef4444',
		nodata: '#64748b'
	};

	// Derived counts per status
	const segmentCounts = $derived.by(() => {
		const counts: Record<SegStatus, number> = { good: 0, warn: 0, bad: 0, nodata: 0 };
		for (const e of entries) {
			if (e.station_start != null && e.station_end != null) {
				counts[segmentStatus(e.spread_rate_actual)]++;
			}
		}
		return counts;
	});

	const avgRate = $derived.by(() => {
		const withRate = entries.filter((e) => e.spread_rate_actual != null);
		if (withRate.length === 0) return null;
		const sum = withRate.reduce((acc, e) => acc + (e.spread_rate_actual ?? 0), 0);
		return sum / withRate.length;
	});

	async function loadEntries() {
		loading = true;
		fetchError = null;
		try {
			const res = await fetch(`/api/job-sites/${site.id}/logs/progress`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json() as { progress: HeatEntry[] };
			entries = data.progress ?? [];
		} catch (err) {
			fetchError = err instanceof Error ? err.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	}

	function clearSegments() {
		for (const pl of segmentPolylines) {
			pl.remove();
		}
		segmentPolylines = [];
	}

	function drawSegments() {
		if (!mapInstance) return;
		clearSegments();

		for (const entry of entries) {
			if (entry.station_start == null || entry.station_end == null) continue;

			const startFt = stationToFeet(entry.station_start);
			const endFt = stationToFeet(entry.station_end);

			const startCoord = feetToLatLng(startFt, waypoints);
			const endCoord = feetToLatLng(endFt, waypoints);
			if (!startCoord || !endCoord) continue;

			const status = segmentStatus(entry.spread_rate_actual);
			const color = STATUS_COLOR[status];

			const rateLabel =
				entry.spread_rate_actual != null
					? `${entry.spread_rate_actual.toFixed(1)} lbs/yd\u00b2`
					: 'No rate recorded';

			const staStart = feetToStation(startFt);
			const staEnd = feetToStation(endFt);

			const pl = L.polyline([startCoord, endCoord], {
				color,
				weight: 8,
				opacity: 0.82
			});

			pl.bindPopup(
				`<div style="font-size:0.82rem;line-height:1.5">` +
				`<strong>Sta ${staStart} \u2013 ${staEnd}</strong><br>` +
				`${rateLabel}` +
				(entry.lane ? `<br>Lane: ${entry.lane}` : '') +
				`</div>`
			);

			pl.addTo(mapInstance);
			segmentPolylines.push(pl);
		}
	}

	function initMap() {
		if (!browser || !mapEl) return;
		if (mapInstance) return;

		mapInstance = L.map(mapEl, { zoomControl: true });

		// Dark / light tile detection
		const isDark = document.documentElement.classList.contains('dark');
		const tileUrl = isDark
			? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
			: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

		L.tileLayer(tileUrl, {
			attribution: '&copy; <a href="https://carto.com">CARTO</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		if (hasRoute) {
			// Draw baseline planned route (dashed gray)
			routePolyline = L.polyline(
				waypoints.map((wp) => [wp.lat, wp.lng]),
				{ color: '#64748b', weight: 4, opacity: 0.55, dashArray: '6 4' }
			).addTo(mapInstance);

			const bounds = L.latLngBounds(waypoints.map((wp) => [wp.lat, wp.lng] as [number, number]));
			mapInstance.fitBounds(bounds, { padding: [30, 30] });
		} else if (hasPinned) {
			mapInstance.setView([site.latitude as number, site.longitude as number], 15);
		}

		drawSegments();
	}

	onMount(async () => {
		await loadEntries();
		if (browser && (hasRoute || hasPinned)) {
			initMap();
		}
	});

	// Re-draw segments when data loads
	$effect(() => {
		if (!loading && mapInstance) {
			drawSegments();
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
	});
</script>

<div class="heatmap-panel">
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
				<path d="M3 3l18 18M9 9a3 3 0 0 0 4.24 4.24M3 7v1a2 2 0 0 0 2 2h2" />
				<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
			</svg>
			<p>Draw a route first to see the spread rate heat map.</p>
		</div>
	{:else}
		<!-- Legend bar -->
		<div class="legend-bar">
			<div class="legend-left">
				<span class="legend-title">Spread Rate Heat Map</span>
				{#if avgRate != null}
					<span class="legend-avg">avg {avgRate.toFixed(1)} lbs/yd&sup2;</span>
				{/if}
			</div>
			<div class="legend-swatches">
				<span class="swatch" style="background:#22c55e" aria-label="In-spec"></span>
				<span class="swatch-label">In&#8209;spec ({segmentCounts.good})</span>
				<span class="swatch" style="background:#f59e0b" aria-label="Near limit"></span>
				<span class="swatch-label">Near ({segmentCounts.warn})</span>
				<span class="swatch" style="background:#ef4444" aria-label="Out of spec"></span>
				<span class="swatch-label">Out ({segmentCounts.bad})</span>
				<span class="swatch" style="background:#64748b" aria-label="No data"></span>
				<span class="swatch-label">No data ({segmentCounts.nodata})</span>
			</div>
		</div>

		<div class="map-wrap" style="height:{height}">
			<div bind:this={mapEl} class="map-el"></div>
			{#if loading}
				<div class="map-overlay-loading" aria-live="polite">Loading&hellip;</div>
			{/if}
			{#if fetchError}
				<div class="map-overlay-error" role="alert">{fetchError}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.heatmap-panel {
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

	.legend-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.legend-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
	}

	.legend-avg {
		font-size: 0.8rem;
		color: var(--text-muted);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		padding: 2px 8px;
		border-radius: 999px;
	}

	.legend-swatches {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.swatch-label {
		font-size: 0.72rem;
		color: var(--text-muted);
		margin-right: 6px;
		white-space: nowrap;
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

	.map-overlay-error {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: color-mix(in srgb, var(--bad, #ef4444) 90%, black);
		color: white;
		font-size: 0.8rem;
		padding: 6px 14px;
		border-radius: 8px;
		z-index: 700;
		pointer-events: none;
	}

	@media (max-width: 640px) {
		.legend-bar {
			padding: 8px 12px;
			gap: 8px;
		}

		.legend-title {
			font-size: 0.8rem;
		}

		.swatch-label {
			font-size: 0.68rem;
		}
	}
</style>

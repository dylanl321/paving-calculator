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
		latitude: number | null;
		longitude: number | null;
	}

	interface ReplayEntry {
		id: string;
		timestamp: string;
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		lane: string | null;
		tons_placed: number | null;
		spread_rate_actual: number | null;
		entry_type: string;
		notes: string | null;
	}

	interface Props {
		site: SitePin;
		waypoints: Waypoint[];
		logId: string;
		logDate: string;
		height?: string;
	}

	let { site, waypoints, logId, logDate, height = '420px' }: Props = $props();

	let mapEl: HTMLDivElement;
	let mapInstance: L.Map | null = null;
	let entries = $state<ReplayEntry[]>([]);
	let loading = $state(true);
	let fetchError = $state<string | null>(null);
	let segmentPolylines: L.Polyline[] = [];
	let routePolyline: L.Polyline | null = null;

	let currentIndex = $state(0);
	let isPlaying = $state(false);
	let playSpeed = $state(1);
	let playInterval: number | undefined;

	const hasRoute = $derived(waypoints.length >= 2);
	const hasPinned = $derived(site.latitude != null && site.longitude != null);
	const hasEntries = $derived(entries.length > 0);

	const visibleEntries = $derived(entries.slice(0, currentIndex + 1));
	const totalTonsShown = $derived(
		visibleEntries.reduce((acc, e) => acc + (e.tons_placed ?? 0), 0)
	);
	const totalDistShown = $derived(
		visibleEntries.reduce((acc, e) => acc + (e.distance_ft ?? 0), 0)
	);

	function stationToFeet(station: number): number {
		return station * 100;
	}

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
		return [wps[wps.length - 1].lat, wps[wps.length - 1].lng];
	}

	const ENTRY_COLOR: Record<string, string> = {
		paving: '#22c55e',
		milling: '#f59e0b',
		tack: '#60a5fa',
		break: '#94a3b8',
		delay: '#94a3b8',
		note: '#94a3b8'
	};

	async function loadEntries() {
		loading = true;
		fetchError = null;
		try {
			const res = await fetch(`/api/job-sites/${site.id}/logs/${logId}/replay`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { entries?: ReplayEntry[] };
			// Include ALL entry types, but filter to only those with station data for mapping
			entries = (data.entries ?? []).filter(
				(e: ReplayEntry) => e.station_start != null && e.station_end != null
			);
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

		for (const entry of visibleEntries) {
			if (entry.station_start == null || entry.station_end == null) continue;

			const startFt = stationToFeet(entry.station_start);
			const endFt = stationToFeet(entry.station_end);

			const startCoord = feetToLatLng(startFt, waypoints);
			const endCoord = feetToLatLng(endFt, waypoints);
			if (!startCoord || !endCoord) continue;

			const color = ENTRY_COLOR[entry.entry_type] ?? '#64748b';

			const staStart = feetToStation(startFt);
			const staEnd = feetToStation(endFt);

			const pl = L.polyline([startCoord, endCoord], {
				color,
				weight: 6,
				opacity: 0.85
			});

			const distLabel = entry.distance_ft ? `${Math.round(entry.distance_ft)} ft` : 'N/A';
			const tonsLabel = entry.tons_placed ? `${entry.tons_placed.toFixed(1)} tons` : 'N/A';
			const laneLabel = entry.lane ? ` | lane ${entry.lane}` : '';

			pl.bindPopup(
				`<div style="font-size:0.82rem;line-height:1.5">` +
					`<strong>${entry.timestamp} - ${entry.entry_type}</strong><br>` +
					`${distLabel} | ${tonsLabel}${laneLabel}` +
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

		const tileUrl = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

		L.tileLayer(tileUrl, {
			attribution: '&copy; <a href="https://carto.com">CARTO</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		if (hasRoute) {
			routePolyline = L.polyline(
				waypoints.map((wp) => [wp.lat, wp.lng]),
				{ color: '#64748b', weight: 4, opacity: 0.55, dashArray: '6 4' }
			).addTo(mapInstance);

			const bounds = L.latLngBounds(
				waypoints.map((wp) => [wp.lat, wp.lng] as [number, number])
			);
			mapInstance.fitBounds(bounds, { padding: [30, 30] });
		} else if (hasPinned) {
			mapInstance.setView([site.latitude as number, site.longitude as number], 15);
		}

		drawSegments();
	}

	function play() {
		if (currentIndex >= entries.length - 1) {
			currentIndex = 0;
		}
		isPlaying = true;
		const intervalMs = playSpeed === 1 ? 800 : playSpeed === 2 ? 400 : 200;

		playInterval = window.setInterval(() => {
			if (currentIndex >= entries.length - 1) {
				pause();
			} else {
				currentIndex++;
			}
		}, intervalMs);
	}

	function pause() {
		isPlaying = false;
		if (playInterval) {
			clearInterval(playInterval);
			playInterval = undefined;
		}
	}

	function togglePlayPause() {
		if (isPlaying) {
			pause();
		} else {
			play();
		}
	}

	function changeSpeed() {
		const wasPlaying = isPlaying;
		pause();
		playSpeed = playSpeed === 1 ? 2 : playSpeed === 2 ? 4 : 1;
		if (wasPlaying) {
			play();
		}
	}

	onMount(async () => {
		await loadEntries();
		if (browser && (hasRoute || hasPinned)) {
			initMap();
		}
	});

	$effect(() => {
		if (!loading && mapInstance) {
			drawSegments();
		}
	});

	onDestroy(() => {
		pause();
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
	});
</script>

<div class="replay-panel">
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
			<p>Draw a route first to see the daily progress replay.</p>
		</div>
	{:else}
		<div class="replay-header">
			<div class="replay-title">
				<span class="replay-date">{logDate}</span>
				<span class="replay-subtitle">Daily Progress Replay</span>
			</div>
			<div class="replay-stats">
				<div class="replay-stat">
					<span class="stat-value">{currentIndex + 1} / {entries.length}</span>
					<span class="stat-label">Entries</span>
				</div>
				<div class="replay-stat">
					<span class="stat-value">{totalTonsShown.toFixed(1)}</span>
					<span class="stat-label">Tons</span>
				</div>
				<div class="replay-stat">
					<span class="stat-value">{(totalDistShown / 5280).toFixed(2)}</span>
					<span class="stat-label">Miles</span>
				</div>
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

		{#if hasEntries}
			<div class="replay-controls">
				<button
					class="control-btn play-btn"
					onclick={togglePlayPause}
					aria-label={isPlaying ? 'Pause' : 'Play'}
				>
					{#if isPlaying}
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="currentColor"
							stroke="none"
							aria-hidden="true"
						>
							<rect x="6" y="4" width="4" height="16" />
							<rect x="14" y="4" width="4" height="16" />
						</svg>
					{:else}
						<svg
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="currentColor"
							stroke="none"
							aria-hidden="true"
						>
							<polygon points="5 3 19 12 5 21 5 3" />
						</svg>
					{/if}
				</button>

				<input
					type="range"
					class="timeline-scrubber"
					min="0"
					max={entries.length - 1}
					bind:value={currentIndex}
					aria-label="Timeline position"
				/>

				<button class="control-btn speed-btn" onclick={changeSpeed} aria-label="Change speed">
					{playSpeed}x
				</button>
			</div>

			<div class="timeline-bar">
				{#each entries as entry, i (entry.id)}
					<div
						class="timeline-entry"
						class:active={i <= currentIndex}
						style="background:{ENTRY_COLOR[entry.entry_type] ?? '#64748b'}"
						title="{entry.timestamp} - {entry.entry_type}"
					></div>
				{/each}
			</div>
		{:else if !loading}
			<div class="empty-state-mini">
				<p>No entries with station data for this day.</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.replay-panel {
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

	.empty-state-mini {
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		margin-top: 12px;
	}

	.empty-state-mini p {
		margin: 0;
		font-size: 0.9rem;
	}

	.replay-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px) var(--radius-md, 12px) 0 0;
		border-bottom: none;
		flex-wrap: wrap;
	}

	.replay-title {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.replay-date {
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--text);
	}

	.replay-subtitle {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.replay-stats {
		display: flex;
		gap: 16px;
		flex-wrap: wrap;
	}

	.replay-stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
		text-align: right;
	}

	.stat-value {
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--accent);
	}

	.stat-label {
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.map-wrap {
		position: relative;
		width: 100%;
		overflow: hidden;
		border: 1px solid var(--border);
		border-bottom: none;
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

	.replay-controls {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-bottom: none;
	}

	.control-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		padding: 12px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius-md, 12px);
		cursor: pointer;
		transition: opacity 0.2s;
		flex-shrink: 0;
	}

	.control-btn:hover {
		opacity: 0.9;
	}

	.speed-btn {
		background: var(--surface-alt, var(--surface));
		color: var(--text);
		border: 1px solid var(--border);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.timeline-scrubber {
		flex: 1;
		min-width: 100px;
		height: 48px;
		cursor: pointer;
		appearance: none;
		background: transparent;
	}

	.timeline-scrubber::-webkit-slider-runnable-track {
		width: 100%;
		height: 6px;
		background: var(--border);
		border-radius: 3px;
	}

	.timeline-scrubber::-moz-range-track {
		width: 100%;
		height: 6px;
		background: var(--border);
		border-radius: 3px;
	}

	.timeline-scrubber::-webkit-slider-thumb {
		appearance: none;
		width: 20px;
		height: 20px;
		background: var(--accent);
		border-radius: 50%;
		margin-top: -7px;
		cursor: pointer;
	}

	.timeline-scrubber::-moz-range-thumb {
		width: 20px;
		height: 20px;
		background: var(--accent);
		border-radius: 50%;
		border: none;
		cursor: pointer;
	}

	.timeline-bar {
		display: flex;
		gap: 2px;
		padding: 8px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px);
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.timeline-entry {
		flex: 1;
		min-width: 4px;
		height: 24px;
		border-radius: 2px;
		opacity: 0.25;
		transition: opacity 0.15s;
	}

	.timeline-entry.active {
		opacity: 0.95;
	}

	@media (max-width: 640px) {
		.replay-header {
			padding: 10px 12px;
			gap: 10px;
		}

		.replay-date {
			font-size: 0.8rem;
		}

		.replay-subtitle {
			font-size: 0.7rem;
		}

		.replay-stats {
			gap: 12px;
		}

		.stat-value {
			font-size: 0.85rem;
		}

		.stat-label {
			font-size: 0.65rem;
		}

		.control-btn {
			min-width: 44px;
			min-height: 44px;
		}

		.timeline-bar {
			padding: 6px 10px;
		}

		.timeline-entry {
			height: 20px;
		}
	}
</style>

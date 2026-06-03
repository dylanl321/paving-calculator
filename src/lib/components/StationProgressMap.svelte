<script lang="ts">
	import { onMount } from 'svelte';
	import { MapContainer, MapPolyline, MapPolygon, ProgressPolyline, StationMarkers, ProgressOverlay } from '$lib/components/map';

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
		spread_rate_actual: number | null;
		tons_placed: number | null;
		log_date: string | null;
		lift: string | null;
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

	let progressEntries = $state<ProgressEntry[]>([]);
	let totalPavedFt = $state(0);
	let today = $state('');
	let daysWithData = $state(0);
	let loading = $state(true);
	let error = $state<string | null>(null);

	// UI toggles
	let showAllLanes = $state(false);
	let showStationMarkers = $state(true);
	let overlayCollapsed = $state(false);

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

	// Build the green "paved" progress segments from logged progress entries.
	// Used only for legacy rendering (no today distinction) when ProgressPolyline is unavailable.
	function buildProgressSegments(entries: ProgressEntry[], wps: Waypoint[]): [number, number][][] {
		const segments: [number, number][][] = [];

		for (const entry of entries) {
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

			const startLL = feetToLatLng(startFt, wps);
			const endLL = feetToLatLng(endFt, wps);
			if (!startLL || !endLL) continue;

			const segPoints: [number, number][] = [startLL];
			let accumulated = 0;
			for (let i = 0; i < wps.length - 1; i++) {
				const segMeters = haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
				const segFt = segMeters * 3.28084;
				const segStart = accumulated;
				const segEnd = accumulated + segFt;
				if (segEnd > startFt && segStart < endFt) {
					const wpFt = accumulated + segFt;
					if (wpFt > startFt && wpFt < endFt) {
						segPoints.push([wps[i + 1].lat, wps[i + 1].lng]);
					}
				}
				accumulated += segFt;
			}
			segPoints.push(endLL);
			segments.push(segPoints);
		}

		return segments;
	}

	async function loadProgress() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/job-sites/${site.id}/logs/progress`);
			if (!res.ok) throw new Error('Failed to load progress');
			const data = (await res.json()) as {
				progress?: ProgressEntry[];
				total_paved_ft?: number;
				today?: string;
				days_with_data?: number;
			};
			progressEntries = data.progress ?? [];
			totalPavedFt = data.total_paved_ft ?? 0;
			today = data.today ?? new Date().toISOString().slice(0, 10);
			daysWithData = data.days_with_data ?? 0;
		} catch (err) {
			error = 'Could not load progress data';
		} finally {
			loading = false;
		}
	}

	const routePoints = $derived<[number, number][]>(waypoints.map((wp) => [wp.lat, wp.lng]));

	const bufferCoords = $derived.by<[number, number][]>(() => {
		if (!hasRoute || !numLanes || !laneWidthFt || numLanes <= 0 || laneWidthFt <= 0) return [];
		const totalWidthMeters = numLanes * laneWidthFt * 0.3048;
		return computeBufferPolygon(waypoints, totalWidthMeters);
	});

	const progressSegments = $derived.by<[number, number][][]>(() =>
		hasRoute ? buildProgressSegments(progressEntries, waypoints) : []
	);

	const bounds = $derived.by<[[number, number], [number, number]] | undefined>(() => {
		if (!hasRoute) return undefined;
		const lats = waypoints.map((wp) => wp.lat);
		const lngs = waypoints.map((wp) => wp.lng);
		return [
			[Math.min(...lats), Math.min(...lngs)],
			[Math.max(...lats), Math.max(...lngs)]
		];
	});

	const center = $derived<[number, number] | undefined>(
		!hasRoute && hasPinned ? [site.latitude as number, site.longitude as number] : undefined
	);

	const routeTotalFt = $derived(totalRouteFt(waypoints));
	const effectiveTotalFt = $derived(
		totalLengthFt && totalLengthFt > 0 ? totalLengthFt : routeTotalFt
	);
	const pctComplete = $derived(
		effectiveTotalFt > 0 ? Math.min(Math.round((totalPavedFt / effectiveTotalFt) * 100), 100) : 0
	);

	// Today's active paving footage
	const activeTodayFt = $derived(
		progressEntries
			.filter((e) => e.log_date === today)
			.reduce((sum, e) => {
				if (e.station_start != null && e.station_end != null) {
					return sum + (e.station_end - e.station_start) * 100;
				} else if (e.distance_ft != null) {
					return sum + e.distance_ft;
				}
				return sum;
			}, 0)
	);

	// Entries with date and tons info for new components
	const enhancedEntries = $derived(
		progressEntries.map((e) => ({
			station_start: e.station_start,
			station_end: e.station_end,
			distance_ft: e.distance_ft,
			lane: e.lane,
			tons_placed: e.tons_placed,
			log_date: e.log_date,
			spread_rate_actual: e.spread_rate_actual
		}))
	);

	onMount(async () => {
		await loadProgress();
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
				<span class="swatch-today" aria-label="Today"></span>
				<span class="swatch-label">Today</span>
				<span class="swatch-planned" aria-label="Planned"></span>
				<span class="swatch-label">Planned</span>
			</span>
		</div>

		<!-- Map controls -->
		<div class="map-controls">
			{#if numLanes && numLanes > 1}
				<button
					class="ctrl-btn"
					class:active={showAllLanes}
					onclick={() => (showAllLanes = !showAllLanes)}
					aria-pressed={showAllLanes}
				>
					{showAllLanes ? 'All Lanes' : 'Current Lane'}
				</button>
			{/if}
			<button
				class="ctrl-btn"
				class:active={showStationMarkers}
				onclick={() => (showStationMarkers = !showStationMarkers)}
				aria-pressed={showStationMarkers}
			>
				{showStationMarkers ? 'Hide Stations' : 'Show Stations'}
			</button>
		</div>

		<div class="map-wrap" style="height:{height}">
			<MapContainer class="station-map" {height} center={center} zoom={15} bounds={bounds}>
				<!-- Planned route (grey) -->
				<MapPolyline
					points={routePoints}
					color="#64748b"
					weight={4}
					opacity={0.6}
					dashArray="6 4"
				/>
				<!-- Road-width buffer -->
				{#if bufferCoords.length > 0}
					<MapPolygon
						points={bufferCoords}
						color="rgba(100, 116, 139, 0.4)"
						fillColor="rgba(100, 116, 139, 0.1)"
						fillOpacity={1}
						weight={1}
					/>
				{/if}
				<!-- Color-coded progress polylines (green = paved, yellow = today) -->
				{#if !loading && enhancedEntries.length > 0}
					<ProgressPolyline
						{waypoints}
						entries={enhancedEntries}
						{today}
						{numLanes}
						{laneWidthFt}
						{showAllLanes}
					/>
				{:else if !loading}
					<!-- Legacy fallback: single green layer -->
					{#each progressSegments as seg, i (i)}
						<MapPolyline points={seg} color="#22c55e" weight={7} opacity={0.85} lineCap="round" />
					{/each}
				{/if}
				<!-- Station markers -->
				<StationMarkers
					{waypoints}
					entries={enhancedEntries}
					visible={showStationMarkers}
					interval_ft={500}
				/>
			</MapContainer>
			{#if loading}
				<div class="map-overlay-loading" aria-live="polite">Loading&hellip;</div>
			{/if}
			<!-- Progress summary overlay -->
			{#if !loading && progressEntries.length > 0}
				<ProgressOverlay
					totalFt={effectiveTotalFt > 0 ? effectiveTotalFt : null}
					pavedFt={totalPavedFt}
					{activeTodayFt}
					{daysWithData}
					bind:collapsed={overlayCollapsed}
				/>
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
		background: #22c55e;
		border-radius: 3px;
		opacity: 0.85;
	}

	.swatch-today {
		display: inline-block;
		width: 20px;
		height: 5px;
		background: #f2c037;
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

	/* Map control toggles */
	.map-controls {
		display: flex;
		gap: 8px;
		padding: 8px 14px;
		background: var(--surface);
		border-left: 1px solid var(--border);
		border-right: 1px solid var(--border);
	}

	.ctrl-btn {
		padding: 0 14px;
		height: 36px;
		min-height: 36px;
		font-size: 0.8rem;
		font-weight: 600;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-muted);
		cursor: pointer;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}

	.ctrl-btn.active {
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		border-color: var(--accent);
		color: var(--accent);
	}

	.ctrl-btn:hover {
		border-color: var(--accent);
	}

	.map-wrap {
		position: relative;
		width: 100%;
		border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-wrap :global(.station-map) {
		height: 100%;
		border-radius: 0;
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

		.map-controls {
			flex-wrap: wrap;
			gap: 6px;
		}
	}
</style>

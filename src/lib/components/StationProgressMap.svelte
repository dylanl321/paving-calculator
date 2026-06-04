<script lang="ts">
	import { onMount } from 'svelte';
	import { MapView, MapPolyline, MapPolygon } from '$lib/components/map-v2';
	import {
		stationToFeet,
		feetToStation,
		polylineLengthFt,
		laneCorridorPolygon,
		sliceRouteByStations,
		feetToMeters
	} from '$lib/services/mapUtils';

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
	let overlayCollapsed = $state(false);

	const hasRoute = $derived(waypoints.length >= 2);
	const hasPinned = $derived(site.latitude != null && site.longitude != null);

	// Build the green "paved" progress segments from logged progress entries by
	// slicing the route between each entry's start/end stations. The slice
	// follows the road centerline (curves included), so segments lie on the road.
	function buildProgressSegments(entries: ProgressEntry[], wps: Waypoint[]): [number, number][][] {
		const segments: [number, number][][] = [];

		for (const entry of entries) {
			let startStation: number | null = null;
			let endStation: number | null = null;

			if (entry.station_start != null) {
				startStation = entry.station_start;
			}
			if (entry.station_end != null) {
				endStation = entry.station_end;
			} else if (startStation != null && entry.distance_ft != null) {
				endStation = feetToStation(stationToFeet(startStation) + entry.distance_ft);
			}

			if (startStation == null || endStation == null) continue;
			if (endStation <= startStation) continue;

			const slice = sliceRouteByStations(wps, startStation, endStation);
			if (!slice) continue;
			segments.push(slice.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]));
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
		const totalWidthMeters = feetToMeters(numLanes * laneWidthFt);
		return laneCorridorPolygon(waypoints, totalWidthMeters);
	});

	const progressSegments = $derived.by<[number, number][][]>(() =>
		hasRoute ? buildProgressSegments(progressEntries, waypoints) : []
	);

	const todaySegments = $derived.by<[number, number][][]>(() => {
		if (!hasRoute || !today) return [];
		return buildProgressSegments(
			progressEntries.filter((e) => e.log_date === today),
			waypoints
		);
	});

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

	const routeTotalFt = $derived(polylineLengthFt(waypoints));
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
					return sum + stationToFeet(e.station_end - e.station_start);
				} else if (e.distance_ft != null) {
					return sum + e.distance_ft;
				}
				return sum;
			}, 0)
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

		<div class="map-wrap" style="height:{height}">
			<MapView
				center={center ?? [waypoints[Math.floor(waypoints.length / 2)].lat, waypoints[Math.floor(waypoints.length / 2)].lng]}
				bounds={bounds}
				zoom={15}
				{height}
			>
				{#snippet layers()}
					<!-- Planned route (grey dashed) -->
					<MapPolyline
						id="planned-route"
						coordinates={routePoints}
						color="#64748b"
						width={4}
						opacity={0.6}
					/>
					<!-- Road-width buffer polygon -->
					{#if bufferCoords.length > 0}
						<MapPolygon
							id="road-buffer"
							coordinates={bufferCoords}
							color="#64748b"
							opacity={0.3}
							fillOpacity={0.08}
						/>
					{/if}
					<!-- Paved segments (green) -->
					{#if !loading}
						{#each progressSegments as seg, i (i)}
							<MapPolyline
								id="paved-{i}"
								coordinates={seg}
								color="#22c55e"
								width={7}
								opacity={0.85}
							/>
						{/each}
						<!-- Today's segments (yellow) -->
						{#each todaySegments as seg, i (i)}
							<MapPolyline
								id="today-{i}"
								coordinates={seg}
								color="#f2c037"
								width={7}
								opacity={0.9}
							/>
						{/each}
					{/if}
				{/snippet}
			</MapView>
			{#if loading}
				<div class="map-overlay-loading" aria-live="polite">Loading&hellip;</div>
			{/if}
			<!-- Progress summary overlay -->
			{#if !loading && progressEntries.length > 0 && !overlayCollapsed}
				<div class="progress-stats-overlay">
					<div class="stat">
						<span class="stat-val">{totalPavedFt.toLocaleString()}</span>
						<span class="stat-lbl">ft paved</span>
					</div>
					{#if activeTodayFt > 0}
						<div class="stat">
							<span class="stat-val today">{activeTodayFt.toLocaleString()}</span>
							<span class="stat-lbl">ft today</span>
						</div>
					{/if}
					{#if pctComplete > 0}
						<div class="stat">
							<span class="stat-val accent">{pctComplete}%</span>
							<span class="stat-lbl">complete</span>
						</div>
					{/if}
					<button
						class="overlay-close"
						onclick={() => (overlayCollapsed = true)}
						aria-label="Dismiss overlay"
					>x</button>
				</div>
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

	.map-wrap {
		position: relative;
		width: 100%;
		border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
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

	.progress-stats-overlay {
		position: absolute;
		bottom: 16px;
		left: 16px;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: rgba(0, 0, 0, 0.72);
		border-radius: 8px;
		z-index: 400;
		backdrop-filter: blur(4px);
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.stat-val {
		font-size: 0.95rem;
		font-weight: 700;
		color: #22c55e;
		line-height: 1.1;
	}

	.stat-val.today {
		color: #f2c037;
	}

	.stat-val.accent {
		color: var(--accent, #f2c037);
	}

	.stat-lbl {
		font-size: 0.65rem;
		color: rgba(255, 255, 255, 0.65);
	}

	.overlay-close {
		background: none;
		border: none;
		color: rgba(255, 255, 255, 0.5);
		cursor: pointer;
		padding: 0 4px;
		font-size: 0.75rem;
		line-height: 1;
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

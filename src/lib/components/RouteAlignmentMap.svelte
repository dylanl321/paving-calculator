<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { MapView, MapMarker, MapPolyline, MapPolygon } from '$lib/components/map-v2';
	import { polylineLengthFt, laneCorridorPolygon, feetToMeters } from '$lib/services/mapUtils';
	import { buildRoadAlignment, snapToNearestRoad } from '$lib/services/roadSnap';
	import type { Map as MapLibreMap } from 'maplibre-gl';

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

	interface Props {
		site: SitePin;
		initialWaypoints?: Waypoint[];
		numLanes?: number | null;
		laneWidthFt?: number | null;
		height?: string;
		onRouteSave?: (waypoints: Waypoint[]) => Promise<void>;
	}

	let {
		site,
		initialWaypoints = [],
		numLanes = null,
		laneWidthFt = null,
		height = '400px',
		onRouteSave
	}: Props = $props();

	let mapInstance = $state<MapLibreMap | null>(null);
	/**
	 * Road-following alignment that gets saved. On first load this is the stored
	 * route; while drawing it is rebuilt from snapped control points so the line
	 * always lies on real roads.
	 */
	// svelte-ignore state_referenced_locally
	let waypoints = $state<Waypoint[]>([...initialWaypoints]);
	/** User-clicked control points (already snapped to the nearest road). */
	let controlPoints = $state<Waypoint[]>([]);
	let drawMode = $state(false);
	let saving = $state(false);
	let snapping = $state(false);
	let snapError = $state('');

	const isMobile = $derived(
		browser && typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	);

	const STATUS_COLORS: Record<string, string> = {
		active: '#22c55e',
		completed: '#94a3b8',
		archived: '#475569'
	};

	const pinned = $derived(site.latitude != null && site.longitude != null);

	const totalLengthFt = $derived(polylineLengthFt(waypoints));

	const color = $derived(STATUS_COLORS[site.status] ?? STATUS_COLORS.active);

	const sitePopupHtml = $derived.by(() => {
		const statusLabel = site.status.charAt(0).toUpperCase() + site.status.slice(1);
		return `<div style="min-width:160px;font-family:system-ui,sans-serif">
				<strong style="font-size:0.95rem">${site.name}</strong><br>
				<span style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>
				${site.location_description ? `<br><span style="font-size:0.8rem;color:#666">${site.location_description}</span>` : ''}
			</div>`;
	});

	const routePoints = $derived<[number, number][]>(waypoints.map((wp) => [wp.lat, wp.lng]));

	const bufferCoords = $derived.by<[number, number][]>(() => {
		if (waypoints.length < 2 || !numLanes || !laneWidthFt || numLanes <= 0 || laneWidthFt <= 0)
			return [];
		const totalWidthMeters = feetToMeters(numLanes * laneWidthFt);
		return laneCorridorPolygon(waypoints, totalWidthMeters);
	});

	function handleMapReady(map: MapLibreMap) {
		mapInstance = map;
		map.on('click', (e) => {
			if (drawMode && !isMobile) {
				addControlPoint(e.lngLat.lat, e.lngLat.lng);
			}
		});
	}

	function toggleDrawMode() {
		drawMode = !drawMode;
		if (mapInstance) {
			mapInstance.getCanvas().style.cursor = drawMode ? 'crosshair' : '';
		}
	}

	/**
	 * Add a clicked point: snap it to the nearest real road, then rebuild the
	 * road-following alignment. Roads-only by design — a click that isn't near a
	 * road is rejected rather than dropping an off-road waypoint.
	 */
	async function addControlPoint(lat: number, lng: number) {
		snapError = '';
		snapping = true;
		try {
			const snapped = await snapToNearestRoad(lat, lng);
			if (!snapped) {
				snapError = 'Could not snap to a road there — tap on a road.';
				return;
			}
			controlPoints = [...controlPoints, { lat: snapped.lat, lng: snapped.lng }];
			await rebuildAlignment();
		} finally {
			snapping = false;
		}
	}

	/** Rebuild the saved alignment so it follows real roads between control points. */
	async function rebuildAlignment() {
		if (controlPoints.length === 0) {
			waypoints = [];
			return;
		}
		const aligned = await buildRoadAlignment(controlPoints);
		waypoints = aligned.map(([lat, lng]) => ({ lat, lng }));
	}

	function addPointAtCenter() {
		if (!mapInstance || !drawMode) return;
		const center = mapInstance.getCenter();
		void addControlPoint(center.lat, center.lng);
	}

	function undoLastPoint() {
		if (controlPoints.length === 0) return;
		controlPoints = controlPoints.slice(0, -1);
		void rebuildAlignment();
	}

	function clearRoute() {
		controlPoints = [];
		waypoints = [];
		snapError = '';
	}

	async function saveRoute() {
		if (!onRouteSave) return;
		saving = true;
		try {
			await onRouteSave(waypoints);
		} catch (err) {
			console.error('Failed to save route:', err);
		} finally {
			saving = false;
		}
	}

	onDestroy(() => {
		mapInstance = null;
	});
</script>

{#if !pinned}
	<div class="empty-map">
		<svg
			width="32"
			height="32"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
			<circle cx="12" cy="10" r="3"></circle>
		</svg>
		<p>No coordinates set — edit job site to add a location.</p>
	</div>
{:else}
	<div class="map-wrap" style="height:{height}">
		<MapView
			center={[site.latitude as number, site.longitude as number]}
			zoom={15}
			{height}
			onready={handleMapReady}
		>
			{#snippet layers()}
				<MapMarker
					lat={site.latitude as number}
					lng={site.longitude as number}
					color={color}
					label={site.name.charAt(0)}
					popupHtml={sitePopupHtml}
				/>

				{#if waypoints.length >= 2}
					<MapPolyline
						id="route-alignment"
						coordinates={routePoints}
						color="#f2c037"
						width={3}
					/>
					{#if bufferCoords.length > 0}
						<MapPolygon
							id="route-buffer"
							coordinates={bufferCoords}
							fillColor="rgba(242, 192, 55, 0.15)"
							strokeColor="rgba(242, 192, 55, 0.5)"
							strokeWidth={1}
						/>
					{/if}
				{/if}

				{#if drawMode}
					{#each controlPoints as cp, i (i)}
						<MapMarker
							lat={cp.lat}
							lng={cp.lng}
							color="#f2c037"
							label={String(i + 1)}
						/>
					{/each}
				{/if}
			{/snippet}
		</MapView>

		<div class="map-controls">
			<button
				class="map-btn"
				class:active={drawMode}
				onclick={toggleDrawMode}
				title={drawMode ? 'Stop drawing' : 'Draw route'}
			>
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
					<path
						d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
					></path>
				</svg>
				{drawMode ? 'Stop' : 'Draw Route'}
			</button>

			{#if drawMode && isMobile}
				<button class="map-btn" onclick={addPointAtCenter} title="Add point at center" disabled={snapping}>
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
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="8" x2="12" y2="16"></line>
						<line x1="8" y1="12" x2="16" y2="12"></line>
					</svg>
					Add Point
				</button>
			{/if}

			{#if drawMode && controlPoints.length > 0}
				<button class="map-btn" onclick={undoLastPoint} title="Undo last point" disabled={snapping}>
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
						<path d="M9 14L4 9l5-5"></path>
						<path d="M4 9h10a6 6 0 0 1 6 6v1"></path>
					</svg>
					Undo
				</button>
			{/if}

			{#if waypoints.length > 0 || controlPoints.length > 0}
				<button class="map-btn map-btn-warn" onclick={clearRoute} title="Clear route">
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
						<polyline points="3 6 5 6 21 6"></polyline>
						<path
							d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
						></path>
					</svg>
					Clear
				</button>

				{#if onRouteSave}
					<button
						class="map-btn map-btn-primary"
						onclick={saveRoute}
						disabled={saving}
						title="Save route"
					>
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
							<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
							<polyline points="17 21 17 13 7 13 7 21"></polyline>
							<polyline points="7 3 7 8 15 8"></polyline>
						</svg>
						{saving ? 'Saving...' : 'Save Route'}
					</button>
				{/if}
			{/if}
		</div>

		{#if waypoints.length > 0}
			<div class="route-stats">
				<div class="stat">
					<span class="stat-label">Length</span>
					<span class="stat-value">{totalLengthFt.toFixed(0)} ft</span>
				</div>
				{#if controlPoints.length > 0}
					<div class="stat">
						<span class="stat-label">Points</span>
						<span class="stat-value">{controlPoints.length}</span>
					</div>
				{/if}
			</div>
		{/if}

		{#if drawMode || snapping || snapError}
			<div class="snap-pill" class:snap-pill--error={!!snapError}>
				{#if snapError}
					{snapError}
				{:else if snapping}
					Snapping to road…
				{:else}
					Tap the road to add points — the line follows real roads
				{/if}
			</div>
		{/if}

		{#if drawMode && isMobile}
			<div class="crosshair">+</div>
		{/if}
	</div>
{/if}

<style>
	.map-wrap {
		position: relative;
		width: 100%;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.empty-map {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 40px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-map svg {
		opacity: 0.4;
	}

	.empty-map p {
		margin: 0;
		font-size: 0.875rem;
	}

	.map-controls {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 500;
	}

	.map-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 14px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.map-btn:hover:not(:disabled) {
		background: var(--surface-alt);
		border-color: var(--accent);
	}

	.map-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.map-btn.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.map-btn-warn {
		border-color: var(--warn);
		color: var(--warn);
	}

	.map-btn-warn:hover:not(:disabled) {
		background: var(--warn);
		color: white;
	}

	.map-btn-primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.map-btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.route-stats {
		position: absolute;
		bottom: 12px;
		left: 12px;
		display: flex;
		gap: 12px;
		z-index: 500;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 10px 14px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.stat-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--accent);
	}

	.crosshair {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 48px;
		font-weight: 300;
		color: var(--accent);
		pointer-events: none;
		z-index: 450;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
	}

	.snap-pill {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 500;
		pointer-events: none;
		background: rgba(0, 0, 0, 0.72);
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		padding: 5px 14px;
		border-radius: 20px;
		white-space: nowrap;
		max-width: calc(100% - 24px);
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.snap-pill--error {
		background: rgba(239, 68, 68, 0.92);
	}

	@media (max-width: 640px) {
		.map-controls {
			top: 8px;
			right: 8px;
			gap: 6px;
		}

		.map-btn {
			min-height: 44px;
			padding: 0 12px;
			font-size: 0.8rem;
		}

		.route-stats {
			bottom: 8px;
			left: 8px;
			padding: 8px 12px;
			gap: 10px;
		}
	}
</style>

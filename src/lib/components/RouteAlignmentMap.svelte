<script lang="ts">
	import { browser } from '$app/environment';
	import {
		MapView,
		MapGeoJSON,
		MapMarker,
		RoadwayLogLayer
	} from '$lib/components/map-v2';
	import { RouteEditController, type RouteEditApi } from '$lib/components/map-v2/editors';
	import { polylineLengthFt } from '$lib/services/mapUtils';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface RoadwayLogEvent {
		id: string;
		milepost: number;
		station?: number;
		event_type: string;
		description: string;
		roadway_width_ft: number | null;
		is_reference: number;
		confidence: string;
		coordinate_geojson: string | null;
	}

	interface SitePin {
		id: string;
		name: string;
		status: 'active' | 'completed' | 'archived';
		latitude: number | null;
		longitude: number | null;
		location_description?: string | null;
	}

	type LocationPrecision = 'route' | 'point' | 'county' | 'none';

	type GeoJsonLineString = {
		type: 'LineString';
		coordinates: [number, number][];
	};

	/**
	 * A real, resolved per-segment centerline from the import pipeline (GDOT LRS /
	 * ArcGIS). These are the actual disconnected segments of the imported Roadway
	 * Log — distinct from the single editable `waypoints` alignment.
	 */
	interface ImportedSegment {
		name: string | null;
		geometry: GeoJsonLineString | null;
		geometry_confidence: 'high' | 'medium' | 'low' | string;
	}

	type CountyBoundaryGeojson = {
		type: 'Feature';
		properties?: { county?: string };
		geometry: {
			type: 'Polygon';
			coordinates: number[][][];
		};
	};

	interface Props {
		site: SitePin;
		initialWaypoints?: Waypoint[];
		numLanes?: number | null;
		laneWidthFt?: number | null;
		roadwayLogEvents?: RoadwayLogEvent[];
		/** Real resolved per-segment centerlines from the import (overlay only, read-only). */
		segments?: ImportedSegment[];
		locationPrecision?: LocationPrecision | null;
		countyBoundaryGeojson?: CountyBoundaryGeojson | null;
		countyBounds?: [[number, number], [number, number]] | null;
		countyName?: string | null;
		height?: string;
		onRouteSave?: (waypoints: Waypoint[]) => Promise<void>;
	}

	let {
		site,
		initialWaypoints = [],
		numLanes = null,
		laneWidthFt = null,
		roadwayLogEvents = [],
		segments = [],
		locationPrecision = null,
		countyBoundaryGeojson = null,
		countyBounds = null,
		countyName = null,
		height = '400px',
		onRouteSave
	}: Props = $props();

	let routeApi = $state<RouteEditApi | null>(null);
	/**
	 * Mirror of the controller's current road-following alignment. Kept here so the
	 * wrapper chrome (length stat, guide text, roadway-log anchoring) can react.
	 * Seeded from the stored route so stats render before the first edit.
	 */
	// svelte-ignore state_referenced_locally
	let waypoints = $state<Waypoint[]>([...initialWaypoints]);
	let showRoadwayLog = $state(true);
	let showSegments = $state(true);

	const drawMode = $derived(routeApi?.drawMode ?? false);
	const saving = $derived(routeApi?.saving ?? false);
	const snapping = $derived(routeApi?.snapping ?? false);
	const snapError = $derived(routeApi?.snapError ?? '');
	const controlPointCount = $derived(routeApi?.controlPoints.length ?? 0);

	const isMobile = $derived(
		browser && typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	);

	const STATUS_COLORS: Record<string, string> = {
		active: '#22c55e',
		completed: '#94a3b8',
		archived: '#475569'
	};

	const effectivePrecision = $derived<LocationPrecision>(
		locationPrecision ?? (site.latitude != null && site.longitude != null ? 'point' : 'none')
	);
	const pinned = $derived(site.latitude != null && site.longitude != null);
	const countyOnly = $derived(effectivePrecision === 'county' && !!countyBoundaryGeojson);

	const countyBoundaryFeature = $derived<GeoJSON.Feature | null>(
		countyBoundaryGeojson
			? {
					type: 'Feature',
					properties: countyBoundaryGeojson.properties ?? null,
					geometry: countyBoundaryGeojson.geometry
				}
			: null
	);

	/** Imported segments that resolved to a real centerline (overlay candidates). */
	const drawableSegments = $derived(
		segments.filter(
			(s): s is ImportedSegment & { geometry: GeoJsonLineString } =>
				s.geometry != null && s.geometry.coordinates.length >= 2
		)
	);
	const hasSegments = $derived(drawableSegments.length > 0);

	const hasMapContext = $derived(pinned || !!countyBoundaryGeojson || hasSegments);
	const hasRoadwayLog = $derived(roadwayLogEvents.length > 0);

	const SEGMENT_COLORS: Record<string, string> = {
		high: '#22c55e',
		medium: '#38bdf8',
		low: '#f97316'
	};
	function segmentColor(confidence: string): string {
		return SEGMENT_COLORS[confidence] ?? SEGMENT_COLORS.medium;
	}

	const totalLengthFt = $derived(polylineLengthFt(waypoints));

	const color = $derived(STATUS_COLORS[site.status] ?? STATUS_COLORS.active);

	const sitePopupHtml = $derived.by(() => {
		const statusLabel = site.status.charAt(0).toUpperCase() + site.status.slice(1);
		return `<div style="min-width:160px;font-family:system-ui,sans-serif">
				<strong style="font-size:0.95rem">${site.name}</strong><br>
				<span style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>
				${site.location_description ? `<br><span style="font-size:0.8rem;color:#94a3b8">${site.location_description}</span>` : ''}
			</div>`;
	});

	const guideText = $derived.by(() => {
		if (countyOnly && waypoints.length < 2) {
			return `${countyName ?? countyBoundaryGeojson?.properties?.county ?? 'County'} is known, but the exact road is not confirmed yet. Load or draw the road line.`;
		}
		if (drawMode) return 'Tap road points in order, or pan the map and use Add Point. Points snap onto roads.';
		if (waypoints.length >= 2) return 'Yellow line is the saved road alignment. Start/end markers show the current route edges.';
		return 'Load a GDOT road line or tap Edit Route to build one from road-snapped points.';
	});

	const mapCenter = $derived<[number, number]>(
		pinned
			? [site.latitude as number, site.longitude as number]
			: countyBounds
				? [
						(countyBounds[0][0] + countyBounds[1][0]) / 2,
						(countyBounds[0][1] + countyBounds[1][1]) / 2
					]
				: [32.84, -83.63]
	);
	const mapBounds = $derived<[[number, number], [number, number]] | null>(
		countyOnly && waypoints.length < 2 ? countyBounds : null
	);

	function onRouteChange(next: Waypoint[]) {
		waypoints = next;
	}

	// Chrome buttons delegate to the controller's exposed actions.
	function toggleDrawMode() {
		routeApi?.toggleDrawMode();
	}
	function addPointAtCenter() {
		routeApi?.addPointAtCenter();
	}
	function undoLastPoint() {
		routeApi?.undoLastPoint();
	}
	function clearRoute() {
		routeApi?.clearRoute();
	}
	function flipRoute() {
		routeApi?.flipRoute();
	}
	function saveRoute() {
		void routeApi?.saveRoute();
	}
</script>

{#if !hasMapContext}
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
		<div class="route-guide">
			<strong>Road alignment</strong>
			<span>{guideText}</span>
		</div>

		<MapView
			center={mapCenter}
			bounds={mapBounds}
			zoom={countyOnly ? 9 : 15}
			{height}
		>
			{#snippet layers()}
				{#if countyBoundaryGeojson && countyBoundaryFeature}
					<MapGeoJSON
						id="county-boundary-{site.id}"
						geojson={countyBoundaryFeature}
						layerType="fill"
						styleFunction={() => ({
							color: '#f2c037',
							width: 2,
							opacity: countyOnly ? 0.85 : 0.45,
							fillOpacity: countyOnly ? 0.16 : 0.07
						})}
					/>
				{/if}

				{#if pinned && !countyOnly}
					<MapMarker
						lat={site.latitude as number}
						lng={site.longitude as number}
						color={color}
						label={site.name.charAt(0)}
						popupHtml={sitePopupHtml}
					/>
				{/if}

				{#if showSegments}
					{#each drawableSegments as seg, i (i)}
						<MapGeoJSON
							id="import-segment-{site.id}-{i}"
							geojson={{
								type: 'Feature',
								properties: {},
								geometry: seg.geometry
							}}
							layerType="line"
							styleFunction={() => ({
								color: segmentColor(seg.geometry_confidence),
								width: 4,
								opacity: 0.9
							})}
						/>
					{/each}
				{/if}

				<RouteEditController
					initialWaypoints={initialWaypoints}
					active={true}
					{numLanes}
					{laneWidthFt}
					{isMobile}
					{onRouteSave}
					onChange={onRouteChange}
					bind:api={routeApi}
				/>

				<RoadwayLogLayer
					{waypoints}
					events={roadwayLogEvents}
					visible={showRoadwayLog && hasRoadwayLog}
				/>

			{/snippet}
		</MapView>

		<div class="map-controls">
			<button
				type="button"
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
				{drawMode ? 'Stop Editing' : 'Edit Route'}
			</button>

			{#if hasSegments}
				<button
					type="button"
					class="map-btn"
					class:active={showSegments}
					onclick={() => (showSegments = !showSegments)}
					title={showSegments ? 'Hide imported segments' : 'Show imported segments'}
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
						<polyline points="4 7 9 4 15 7 20 4 20 17 15 20 9 17 4 20 4 7"></polyline>
						<line x1="9" y1="4" x2="9" y2="17"></line>
						<line x1="15" y1="7" x2="15" y2="20"></line>
					</svg>
					Segments
				</button>
			{/if}

			{#if hasRoadwayLog}
				<button
					type="button"
					class="map-btn"
					class:active={showRoadwayLog}
					onclick={() => (showRoadwayLog = !showRoadwayLog)}
					title={showRoadwayLog ? 'Hide roadway log' : 'Show roadway log'}
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
						<line x1="8" y1="6" x2="21" y2="6"></line>
						<line x1="8" y1="12" x2="21" y2="12"></line>
						<line x1="8" y1="18" x2="21" y2="18"></line>
						<line x1="3" y1="6" x2="3.01" y2="6"></line>
						<line x1="3" y1="12" x2="3.01" y2="12"></line>
						<line x1="3" y1="18" x2="3.01" y2="18"></line>
					</svg>
					Log
				</button>
			{/if}

			{#if drawMode}
				<button type="button" class="map-btn" onclick={addPointAtCenter} title="Add point at center" disabled={snapping}>
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

			{#if drawMode && controlPointCount > 0}
				<button type="button" class="map-btn" onclick={undoLastPoint} title="Undo last point" disabled={snapping}>
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

			{#if waypoints.length > 0 || controlPointCount > 0}
				{#if waypoints.length >= 2}
					<button type="button" class="map-btn" onclick={flipRoute} title="Reverse route direction">
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
							<path d="M17 1l4 4-4 4"></path>
							<path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
							<path d="M7 23l-4-4 4-4"></path>
							<path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
						</svg>
						Flip
					</button>
				{/if}
				<button type="button" class="map-btn map-btn-warn" onclick={clearRoute} title="Clear route">
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
						type="button"
						class="map-btn map-btn-primary"
						onclick={saveRoute}
						disabled={saving || waypoints.length < 2}
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

		{#if showSegments && hasSegments}
			<div class="segment-legend">
				<span class="seg-legend-title">{drawableSegments.length} imported segment{drawableSegments.length === 1 ? '' : 's'}</span>
				<span class="seg-key"><i style="background:{SEGMENT_COLORS.high}"></i>High</span>
				<span class="seg-key"><i style="background:{SEGMENT_COLORS.medium}"></i>Medium</span>
				<span class="seg-key"><i style="background:{SEGMENT_COLORS.low}"></i>Low</span>
			</div>
		{/if}

		{#if waypoints.length > 0}
			<div class="route-stats">
				<div class="stat">
					<span class="stat-label">Length</span>
					<span class="stat-value">{totalLengthFt.toFixed(0)} ft</span>
				</div>
				{#if controlPointCount > 0}
					<div class="stat">
						<span class="stat-label">Control points</span>
						<span class="stat-value">{controlPointCount}</span>
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
					Tap road points in order — the line follows real roads
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

	.route-guide {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 500;
		max-width: min(360px, calc(100% - 190px));
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px;
		background: rgba(15, 23, 42, 0.9);
		border: 1px solid rgba(242, 192, 55, 0.35);
		border-radius: var(--radius);
		color: #fff;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
		pointer-events: none;
	}

	.route-guide strong {
		color: #f2c037;
		font-size: 0.78rem;
		letter-spacing: 0.03em;
		text-transform: uppercase;
	}

	.route-guide span {
		font-size: 0.82rem;
		line-height: 1.3;
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

	.segment-legend {
		position: absolute;
		bottom: 12px;
		right: 12px;
		z-index: 500;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 4px 12px;
		max-width: calc(100% - 24px);
		padding: 8px 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
		font-size: 0.72rem;
		color: var(--text);
	}

	.seg-legend-title {
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
	}

	.seg-key {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.seg-key i {
		width: 14px;
		height: 4px;
		border-radius: 2px;
		display: inline-block;
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
		bottom: 12px;
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
			max-width: 46%;
		}

		.route-guide {
			top: 8px;
			left: 8px;
			max-width: calc(54% - 16px);
			padding: 8px 10px;
		}

		.route-guide span {
			font-size: 0.76rem;
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

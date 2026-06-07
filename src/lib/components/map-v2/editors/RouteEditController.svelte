<script lang="ts" module>
	export interface RouteEditWaypoint {
		lat: number;
		lng: number;
	}

	/**
	 * Imperative + reactive surface a parent uses to drive the route editor and
	 * render its own toolbar/chrome. Exposed via the bindable `api` prop so the
	 * controller stays the single owner of the snap/draw logic while the parent
	 * owns the visual chrome.
	 */
	export interface RouteEditApi {
		/** Current road-following alignment (the line that gets saved). */
		readonly waypoints: RouteEditWaypoint[];
		/** User-clicked control points (already snapped to the nearest road). */
		readonly controlPoints: RouteEditWaypoint[];
		readonly drawMode: boolean;
		readonly saving: boolean;
		readonly snapping: boolean;
		readonly snapError: string;
		toggleDrawMode(): void;
		addPointAtCenter(): void;
		undoLastPoint(): void;
		clearRoute(): void;
		flipRoute(): void;
		saveRoute(): Promise<void>;
	}
</script>

<script lang="ts">
	/**
	 * RouteEditController — road-alignment drawing logic + layers that ATTACH to
	 * an existing <MapView> via getMapContext(). It does NOT render its own map;
	 * mount it inside a <MapView>'s {#snippet layers()} so a parent can host one
	 * shared map and toggle this controller on/off via the `active` prop.
	 *
	 * Roads-only by design: clicked points snap to the nearest real road
	 * (snapToNearestRoad) and the saved alignment is rebuilt to follow real roads
	 * between snapped control points (buildRoadAlignment). A click that can't snap
	 * to a road is rejected rather than dropping an off-road waypoint.
	 *
	 * Coordinates: props/markers use [lat, lng]; geometry math goes through the
	 * shared services which return [lat, lng]. (Stored GeoJSON is [lng, lat].)
	 */
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { getMapContext } from '../mapContext.js';
	import MapPolyline from '../MapPolyline.svelte';
	import MapMarker from '../MapMarker.svelte';
	import MapPolygon from '../MapPolygon.svelte';
	import { laneCorridorPolygon, feetToMeters } from '$lib/services/mapUtils';
	import { buildRoadAlignment, snapToNearestRoad } from '$lib/services/roadSnap';
	import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';

	interface Props {
		/** Stored route alignment ([lat,lng] objects). Snapshotted into editable state. */
		initialWaypoints?: RouteEditWaypoint[];
		/** Whether map interactions are enabled. A parent enables exactly one editor. */
		active?: boolean;
		/** Lane count + width drive the optional corridor buffer overlay. */
		numLanes?: number | null;
		laneWidthFt?: number | null;
		/** On mobile, map clicks are ignored (use Add Point at center crosshair instead). */
		isMobile?: boolean;
		/** Persist callback — receives the current road-following alignment. */
		onRouteSave?: (waypoints: RouteEditWaypoint[]) => Promise<void>;
		/** Fired whenever the editable alignment changes (draw/undo/clear/flip). */
		onChange?: (waypoints: RouteEditWaypoint[]) => void;
		/** Two-way handle exposing reactive state + actions to the parent chrome. */
		api?: RouteEditApi | null;
	}

	let {
		initialWaypoints = [],
		active = false,
		numLanes = null,
		laneWidthFt = null,
		isMobile = false,
		onRouteSave,
		onChange,
		api = $bindable(null)
	}: Props = $props();

	const { getMap } = getMapContext();

	// svelte-ignore state_referenced_locally
	let waypoints = $state<RouteEditWaypoint[]>([...initialWaypoints]);
	let controlPoints = $state<RouteEditWaypoint[]>([]);
	let drawMode = $state(false);
	let saving = $state(false);
	let snapping = $state(false);
	let snapError = $state('');
	let controlMarkers: MapLibreMarker[] = [];
	// Tracks identity of the last seen prop array to detect a new stored route;
	// intentionally a one-time snapshot, not reactive.
	// svelte-ignore state_referenced_locally
	let previousInitialWaypoints = initialWaypoints;

	const routePoints = $derived<[number, number][]>(waypoints.map((wp) => [wp.lat, wp.lng]));
	const firstWaypoint = $derived(waypoints.length >= 2 ? waypoints[0] : null);
	const lastWaypoint = $derived(waypoints.length >= 2 ? waypoints[waypoints.length - 1] : null);

	const bufferCoords = $derived.by<[number, number][]>(() => {
		if (waypoints.length < 2 || !numLanes || !laneWidthFt || numLanes <= 0 || laneWidthFt <= 0)
			return [];
		const totalWidthMeters = feetToMeters(numLanes * laneWidthFt);
		return laneCorridorPolygon(waypoints, totalWidthMeters);
	});

	// Reset editable state when a new stored route flows in from the parent.
	$effect(() => {
		if (initialWaypoints !== previousInitialWaypoints) {
			previousInitialWaypoints = initialWaypoints;
			waypoints = [...initialWaypoints];
			controlPoints = [];
		}
	});

	// When the parent deactivates this editor, leave draw mode and clear cursor.
	$effect(() => {
		if (!active && drawMode) {
			drawMode = false;
		}
	});

	function emitChange() {
		onChange?.(waypoints);
	}

	function toggleDrawMode() {
		drawMode = !drawMode;
		if (drawMode && controlPoints.length === 0 && waypoints.length >= 2) {
			const mid = waypoints[Math.floor(waypoints.length / 2)];
			controlPoints = [waypoints[0], mid, waypoints[waypoints.length - 1]];
		}
		const map = getMap();
		if (map) map.getCanvas().style.cursor = drawMode ? 'crosshair' : '';
	}

	/**
	 * Add a clicked point: snap it to the nearest real road, then rebuild the
	 * road-following alignment. Roads-only — a click that isn't near a road is
	 * rejected rather than dropping an off-road waypoint.
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
			emitChange();
			return;
		}
		const aligned = await buildRoadAlignment(controlPoints);
		waypoints = aligned.map(([lat, lng]) => ({ lat, lng }));
		emitChange();
	}

	function addPointAtCenter() {
		const map = getMap();
		if (!map || !drawMode) return;
		const center = map.getCenter();
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
		emitChange();
	}

	function flipRoute() {
		waypoints = [...waypoints].reverse();
		controlPoints = [...controlPoints].reverse();
		emitChange();
	}

	function clearControlMarkers() {
		for (const marker of controlMarkers) marker.remove();
		controlMarkers = [];
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

	// Wire the map click handler whenever the live map (or active state) changes.
	$effect(() => {
		if (!browser || !active) return;
		const map = getMap();
		if (!map) return;
		function onMapClick(e: { lngLat: { lat: number; lng: number } }) {
			if (drawMode && !isMobile) {
				void addControlPoint(e.lngLat.lat, e.lngLat.lng);
			}
		}
		map.on('click', onMapClick);
		return () => {
			map.off('click', onMapClick);
		};
	});

	// Render draggable, road-snapping control-point markers while drawing.
	$effect(() => {
		const map = getMap();
		const points = controlPoints;
		if (!browser || !map || !drawMode || !active) {
			clearControlMarkers();
			return;
		}

		const activeMap: MapLibreMap = map;
		let cancelled = false;
		async function renderMarkers() {
			clearControlMarkers();
			const { Marker } = await import('maplibre-gl');
			if (cancelled) return;
			controlMarkers = points.map((cp, i) => {
				const el = document.createElement('button');
				el.type = 'button';
				el.className = 'route-control-point';
				el.textContent = String(i + 1);
				const marker = new Marker({ element: el, draggable: true, anchor: 'center' })
					.setLngLat([cp.lng, cp.lat])
					.addTo(activeMap);
				marker.on('dragend', async () => {
					const pos = marker.getLngLat();
					snapError = '';
					snapping = true;
					try {
						const snapped = await snapToNearestRoad(pos.lat, pos.lng);
						if (!snapped) {
							marker.setLngLat([cp.lng, cp.lat]);
							snapError = 'Could not snap that point to a road.';
							return;
						}
						const next = [...controlPoints];
						next[i] = { lat: snapped.lat, lng: snapped.lng };
						controlPoints = next;
						await rebuildAlignment();
					} finally {
						snapping = false;
					}
				});
				return marker;
			});
		}

		void renderMarkers();
		return () => {
			cancelled = true;
			clearControlMarkers();
		};
	});

	// Expose the reactive state + actions to the parent chrome.
	$effect(() => {
		api = {
			get waypoints() {
				return waypoints;
			},
			get controlPoints() {
				return controlPoints;
			},
			get drawMode() {
				return drawMode;
			},
			get saving() {
				return saving;
			},
			get snapping() {
				return snapping;
			},
			get snapError() {
				return snapError;
			},
			toggleDrawMode,
			addPointAtCenter,
			undoLastPoint,
			clearRoute,
			flipRoute,
			saveRoute
		};
	});

	onDestroy(() => {
		clearControlMarkers();
	});
</script>

{#if waypoints.length >= 2}
	<MapPolyline id="route-alignment" coordinates={routePoints} color="#f2c037" width={3} />
	{#if bufferCoords.length > 0}
		<MapPolygon
			id="route-buffer"
			coordinates={bufferCoords}
			fillColor="rgba(242, 192, 55, 0.15)"
			strokeColor="rgba(242, 192, 55, 0.5)"
			strokeWidth={1}
		/>
	{/if}
	{#if firstWaypoint}
		<MapMarker
			lat={firstWaypoint.lat}
			lng={firstWaypoint.lng}
			color="#f2c037"
			label="S"
			popupHtml="<b>Route start edge</b><br>Set project start/end below for the actual project limits."
		/>
	{/if}
	{#if lastWaypoint}
		<MapMarker
			lat={lastWaypoint.lat}
			lng={lastWaypoint.lng}
			color="#f2c037"
			label="E"
			popupHtml="<b>Route end edge</b><br>Set project start/end below for the actual project limits."
		/>
	{/if}
{/if}

<style>
	:global(.route-control-point) {
		width: 30px;
		height: 30px;
		border-radius: 999px;
		border: 2px solid #111827;
		background: #f2c037;
		color: #111827;
		font-weight: 800;
		cursor: grab;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
	}

	:global(.route-control-point:active) {
		cursor: grabbing;
	}
</style>

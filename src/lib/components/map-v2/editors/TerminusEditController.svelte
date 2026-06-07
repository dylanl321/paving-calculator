<script lang="ts" module>
	export interface TerminusEditWaypoint {
		lat: number;
		lng: number;
	}

	export type TerminusField = 'begin' | 'end';

	/**
	 * Imperative + reactive surface a parent uses to drive the terminus/station
	 * picker and render its own toggle/summary chrome. The controller stays the
	 * single owner of the click → station projection → snap-back-to-road logic.
	 */
	export interface TerminusEditApi {
		readonly activeField: TerminusField | null;
		readonly flashMessage: string;
		setActiveField(field: TerminusField | null): void;
		clear(): void;
		useFullRoute(): void;
	}
</script>

<script lang="ts">
	/**
	 * TerminusEditController — begin/end station picking logic + station markers
	 * that ATTACH to an existing <MapView> via getMapContext(). It does NOT render
	 * its own map; mount it inside a <MapView>'s {#snippet layers()} so a parent
	 * can host one shared map and toggle this controller via the `active` prop.
	 *
	 * Roads-only by design: every click is projected onto the route centerline
	 * (coordinateToStation) and the marker is snapped back onto the road
	 * (stationToCoordinate), so termini can only ever land ON the road. A click
	 * off the road is rejected. This backs both the named Begin/End terminus
	 * picker and the plain start/end station picker.
	 */
	import { getMapContext } from '../mapContext.js';
	import MapPolyline from '../MapPolyline.svelte';
	import MapMarker from '../MapMarker.svelte';
	import { coordinateToStation, stationToCoordinate } from '$lib/services/mapUtils';
	import { formatStation } from '$lib/services/gpsStation';

	interface Props {
		waypoints?: TerminusEditWaypoint[];
		/** Begin terminus / start station as an offset along the route. */
		beginStation?: number | null;
		/** End terminus / end station as an offset along the route. */
		endStation?: number | null;
		/** Marker colours (TerminusPicker uses brand yellow; both end markers are blue). */
		beginColor?: string;
		endColor?: string;
		/** Whether map interactions are enabled. A parent enables exactly one editor. */
		active?: boolean;
		/**
		 * Fired when a terminus is set: the field, the station offset, and the
		 * snapped [lat,lng]. Plain station pickers ignore the coordinate.
		 */
		onPick?: (field: TerminusField, station: number, coord: [number, number]) => void;
		/** Two-way handle exposing reactive state + actions to the parent chrome. */
		api?: TerminusEditApi | null;
	}

	let {
		waypoints = [],
		beginStation = $bindable(null),
		endStation = $bindable(null),
		beginColor = '#f2c037',
		endColor = '#3b82f6',
		active = true,
		onPick,
		api = $bindable(null)
	}: Props = $props();

	const { getMap } = getMapContext();

	let activeField = $state<TerminusField | null>('begin');
	let flashMessage = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;

	const hasRoute = $derived(waypoints.length >= 2);
	const routePoints = $derived(waypoints.map((w) => [w.lat, w.lng] as [number, number]));

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

	function flash(msg: string) {
		flashMessage = msg;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			flashMessage = '';
		}, 1400);
	}

	function setActiveField(field: TerminusField | null) {
		activeField = field;
	}

	function clear() {
		beginStation = null;
		endStation = null;
		activeField = 'begin';
	}

	function setTerminus(field: TerminusField, lat: number, lng: number): boolean {
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

	// Wire the map click handler. Re-bound whenever the map or active state changes.
	$effect(() => {
		if (!active) return;
		const map = getMap();
		if (!map) return;
		function onMapClick(e: { lngLat: { lat: number; lng: number } }) {
			if (!activeField) return;
			setTerminus(activeField, e.lngLat.lat, e.lngLat.lng);
		}
		map.on('click', onMapClick);
		return () => {
			map.off('click', onMapClick);
		};
	});

	$effect(() => {
		api = {
			get activeField() {
				return activeField;
			},
			get flashMessage() {
				return flashMessage;
			},
			setActiveField,
			clear,
			useFullRoute
		};
	});
</script>

{#if hasRoute}
	<MapPolyline id="terminus-route" coordinates={routePoints} color="#f59e0b" width={4} opacity={0.9} />
	{#if beginCoord}
		<MapMarker
			lat={beginCoord[0]}
			lng={beginCoord[1]}
			color={beginColor}
			label="S"
			popupHtml="<b>Start: {formatStation(beginStation!)}</b>"
		/>
	{/if}
	{#if endCoord}
		<MapMarker
			lat={endCoord[0]}
			lng={endCoord[1]}
			color={endColor}
			label="E"
			popupHtml="<b>End: {formatStation(endStation!)}</b>"
		/>
	{/if}
{/if}

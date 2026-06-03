<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface ProgressEntry {
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		lane: string | null;
		tons_placed: number | null;
		log_date: string | null;
	}

	interface Props {
		waypoints: Waypoint[];
		entries: ProgressEntry[];
		today: string;
		numLanes?: number | null;
		laneWidthFt?: number | null;
		showAllLanes?: boolean;
	}

	let {
		waypoints,
		entries,
		today,
		numLanes = null,
		laneWidthFt = null,
		showAllLanes = false
	}: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);

	let layers: L.Polyline[] = [];

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

	function feetToLatLng(targetFt: number, wps: Waypoint[]): [number, number] | null {
		if (wps.length < 2) return null;
		if (targetFt <= 0) return [wps[0].lat, wps[0].lng];
		let accumulated = 0;
		for (let i = 0; i < wps.length - 1; i++) {
			const segMeters = haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
			const segFt = segMeters * 3.28084;
			if (accumulated + segFt >= targetFt) {
				const fraction = (targetFt - accumulated) / segFt;
				return [
					wps[i].lat + fraction * (wps[i + 1].lat - wps[i].lat),
					wps[i].lng + fraction * (wps[i + 1].lng - wps[i].lng)
				];
			}
			accumulated += segFt;
		}
		return [wps[wps.length - 1].lat, wps[wps.length - 1].lng];
	}

	function buildSegmentPoints(
		startFt: number,
		endFt: number,
		wps: Waypoint[]
	): [number, number][] {
		const startLL = feetToLatLng(startFt, wps);
		const endLL = feetToLatLng(endFt, wps);
		if (!startLL || !endLL) return [];

		const pts: [number, number][] = [startLL];
		let accumulated = 0;
		for (let i = 0; i < wps.length - 1; i++) {
			const segMeters = haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
			const segFt = segMeters * 3.28084;
			const segStart = accumulated;
			const segEnd = accumulated + segFt;
			if (segEnd > startFt && segStart < endFt) {
				const wpFt = accumulated + segFt;
				if (wpFt > startFt && wpFt < endFt) {
					pts.push([wps[i + 1].lat, wps[i + 1].lng]);
				}
			}
			accumulated += segFt;
		}
		pts.push(endLL);
		return pts;
	}

	// Compute perpendicular offset for a waypoint
	function offsetPoints(
		wps: Waypoint[],
		offsetMeters: number
	): [number, number][] {
		if (wps.length < 2 || offsetMeters === 0) {
			return wps.map((w) => [w.lat, w.lng] as [number, number]);
		}
		return wps.map((wp, i) => {
			let angle: number;
			if (i === 0) {
				angle = Math.atan2(wps[1].lat - wps[0].lat, wps[1].lng - wps[0].lng);
			} else if (i === wps.length - 1) {
				angle = Math.atan2(
					wps[i].lat - wps[i - 1].lat,
					wps[i].lng - wps[i - 1].lng
				);
			} else {
				const a1 = Math.atan2(wp.lat - wps[i - 1].lat, wp.lng - wps[i - 1].lng);
				const a2 = Math.atan2(wps[i + 1].lat - wp.lat, wps[i + 1].lng - wp.lng);
				angle = (a1 + a2) / 2;
			}
			const perpAngle = angle + Math.PI / 2;
			const latPerM = 1 / 111320;
			const lngPerM = 1 / (111320 * Math.cos((wp.lat * Math.PI) / 180));
			return [
				wp.lat + Math.sin(perpAngle) * offsetMeters * latPerM,
				wp.lng + Math.cos(perpAngle) * offsetMeters * lngPerM
			] as [number, number];
		});
	}

	// Map lane string to numeric index (1-based, default 1)
	function laneIndex(lane: string | null): number {
		if (!lane) return 1;
		const n = parseInt(lane, 10);
		return isNaN(n) ? 1 : n;
	}

	function clearLayers(map: L.Map) {
		for (const layer of layers) {
			map.removeLayer(layer);
		}
		layers = [];
	}

	$effect(() => {
		const map = ctx?.map;
		if (!map) return;

		clearLayers(map);

		if (waypoints.length < 2 || entries.length === 0) return;

		const laneCount = numLanes && numLanes > 1 ? numLanes : 1;
		const laneW = laneWidthFt && laneWidthFt > 0 ? laneWidthFt * 0.3048 : 3.66; // default ~12ft

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

			if (startFt == null || endFt == null || endFt <= startFt) continue;

			const color = entry.log_date === today ? '#f2c037' : '#22c55e';
			const weight = 7;
			const opacity = 0.9;

			if (showAllLanes && laneCount > 1) {
				// Draw for the specific lane this entry is on
				const li = laneIndex(entry.lane);
				// Offset: center of each lane
				const offsetM = (li - (laneCount + 1) / 2) * laneW;
				const offsetWps = offsetPoints(waypoints, offsetM).map((p) => ({ lat: p[0], lng: p[1] }));
				const pts = buildSegmentPoints(startFt, endFt, offsetWps);
				if (pts.length >= 2) {
					const poly = L.polyline(pts, { color, weight, opacity, lineCap: 'round' }).addTo(map);
					layers.push(poly);
				}
			} else {
				// Single centerline
				const pts = buildSegmentPoints(startFt, endFt, waypoints);
				if (pts.length >= 2) {
					const poly = L.polyline(pts, { color, weight, opacity, lineCap: 'round' }).addTo(map);
					layers.push(poly);
				}
			}
		}

		return () => {
			clearLayers(map);
		};
	});

	onDestroy(() => {
		const map = ctx?.map;
		if (map) clearLayers(map);
	});
</script>

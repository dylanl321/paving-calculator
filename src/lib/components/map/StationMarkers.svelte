<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	/** Legacy entries shape */
	interface ProgressEntry {
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		lane: string | null;
		tons_placed: number | null;
		log_date: string | null;
		spread_rate_actual?: number | null;
	}

	/** Log entry for GeoJSON mode */
	interface LogEntry {
		station_start: number | null;
		station_end: number | null;
		tons_placed: number | null;
		log_date?: string | null;
		spread_rate_actual?: number | null;
	}

	interface GeoJSONLineString {
		type: 'LineString';
		coordinates: [number, number][];
	}

	interface Props {
		/** GeoJSON LineString geometry */
		geometry?: GeoJSONLineString | null;
		/** Interval in feet between station markers (default 500 = 5+00 spacing) */
		interval_ft?: number;
		/** Log entries for GeoJSON mode */
		logEntries?: LogEntry[];
		/** Whether markers are visible at all */
		visible?: boolean;
		/** Legacy: waypoints array */
		waypoints?: Waypoint[];
		/** Legacy: progress entries */
		entries?: ProgressEntry[];
	}

	let {
		geometry = null,
		interval_ft = 500,
		logEntries = [],
		visible = true,
		waypoints = [],
		entries = []
	}: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);

	/** All visual + touch-target marker pairs */
	let visualMarkers: L.CircleMarker[] = [];
	let touchMarkers: L.CircleMarker[] = [];

	const MIN_ZOOM = 15;

	// ------- Geometry helpers -------

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

	function totalRouteFt(wps: Waypoint[]): number {
		let m = 0;
		for (let i = 0; i < wps.length - 1; i++) {
			m += haversineMeters(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
		}
		return m * 3.28084;
	}

	function geoJsonToWaypoints(geom: GeoJSONLineString): Waypoint[] {
		return geom.coordinates.map(([lng, lat]) => ({ lat, lng }));
	}

	// ------- Station label (e.g. 500ft -> '5+00', 1250ft -> '12+50') -------

	function stationLabel(ft: number): string {
		const hundreds = Math.floor(ft / 100);
		const remainder = Math.round(ft % 100);
		return `${hundreds}+${remainder.toString().padStart(2, '0')}`;
	}

	// ------- Find matching log entries -------

	function findLogEntriesAtFt(ft: number, logs: LogEntry[]): LogEntry[] {
		return logs.filter((e) => {
			const startFt = e.station_start != null ? e.station_start * 100 : null;
			const endFt = e.station_end != null ? e.station_end * 100 : null;
			if (startFt == null || endFt == null) return false;
			return ft >= startFt && ft <= endFt;
		});
	}

	function findEntriesAtFt(ft: number, ents: ProgressEntry[]): ProgressEntry[] {
		return ents.filter((e) => {
			const startFt = e.station_start != null ? e.station_start * 100 : null;
			let endFt: number | null = null;
			if (e.station_end != null) {
				endFt = e.station_end * 100;
			} else if (startFt != null && e.distance_ft != null) {
				endFt = startFt + e.distance_ft;
			}
			if (startFt == null || endFt == null) return false;
			return ft >= startFt && ft <= endFt;
		});
	}

	// ------- Popup HTML -------

	function buildPopupHtmlFromLog(ft: number, logs: LogEntry[]): string {
		const label = stationLabel(ft);
		const matching = findLogEntriesAtFt(ft, logs);

		if (matching.length === 0) {
			return `<div class="smarker-popup"><strong>${label}</strong><p class="unpaved">Not yet paved</p></div>`;
		}

		const entry = matching[matching.length - 1];
		const dateStr = entry.log_date ? entry.log_date : 'Unknown date';
		const tonsStr = entry.tons_placed != null ? `${entry.tons_placed.toFixed(1)} tons` : '';
		const rateStr =
			entry.spread_rate_actual != null ? `${entry.spread_rate_actual.toFixed(0)} lbs/yd\u00b2` : '';

		let html = `<div class="smarker-popup"><strong>${label}</strong>`;
		html += `<p>Paved: ${dateStr}</p>`;
		if (tonsStr) html += `<p>Tons: ${tonsStr}</p>`;
		if (rateStr) html += `<p>Spread: ${rateStr}</p>`;
		html += '</div>';
		return html;
	}

	function buildPopupHtmlFromEntries(ft: number, ents: ProgressEntry[]): string {
		const label = stationLabel(ft);
		const matching = findEntriesAtFt(ft, ents);

		if (matching.length === 0) {
			return `<div class="smarker-popup"><strong>${label}</strong><p class="unpaved">Not yet paved</p></div>`;
		}

		const entry = matching[matching.length - 1];
		const dateStr = entry.log_date ? entry.log_date : 'Unknown date';
		const tonsStr = entry.tons_placed != null ? `${entry.tons_placed.toFixed(1)} tons` : '';
		const rateStr =
			entry.spread_rate_actual != null ? `${entry.spread_rate_actual.toFixed(0)} lbs/yd\u00b2` : '';

		let html = `<div class="smarker-popup"><strong>${label}</strong>`;
		html += `<p>Paved: ${dateStr}</p>`;
		if (tonsStr) html += `<p>Tons: ${tonsStr}</p>`;
		if (rateStr) html += `<p>Spread: ${rateStr}</p>`;
		if (entry.lane) html += `<p>Lane: ${entry.lane}</p>`;
		html += '</div>';
		return html;
	}

	// ------- Marker lifecycle -------

	function clearAllMarkers(map: L.Map) {
		for (const m of visualMarkers) map.removeLayer(m);
		for (const m of touchMarkers) map.removeLayer(m);
		visualMarkers = [];
		touchMarkers = [];
	}

	function setMarkersVisible(show: boolean) {
		const style = show ? '' : 'none';
		for (const m of visualMarkers) {
			const el = m.getElement() as HTMLElement | null;
			if (el) el.style.display = style;
		}
		for (const m of touchMarkers) {
			const el = m.getElement() as HTMLElement | null;
			if (el) el.style.display = style;
		}
	}

	function buildMarkers(map: L.Map, wps: Waypoint[], useLogEntries: boolean) {
		clearAllMarkers(map);

		const routeFt = totalRouteFt(wps);
		const intervalFt = interval_ft > 0 ? interval_ft : 500;
		const currentZoom = map.getZoom();
		const shouldShow = visible && currentZoom >= MIN_ZOOM;

		let ft = 0;
		while (ft <= routeFt + 1) {
			const ll = feetToLatLng(ft, wps);
			if (ll) {
				const hasPaving = useLogEntries
					? findLogEntriesAtFt(ft, logEntries).length > 0
					: findEntriesAtFt(ft, entries).length > 0;

				const popupHtml = useLogEntries
					? buildPopupHtmlFromLog(ft, logEntries)
					: buildPopupHtmlFromEntries(ft, entries);

				// Visual marker (small dot)
				const visual = L.circleMarker(ll, {
					radius: 5,
					color: hasPaving ? '#22c55e' : '#6b7280',
					fillColor: hasPaving ? '#22c55e' : '#374151',
					fillOpacity: 0.9,
					weight: 2,
					interactive: false
				});

				// Touch target: invisible large circle for 48px tap area (radius 24 at 2px weight = 48px)
				const touch = L.circleMarker(ll, {
					radius: 24,
					color: 'transparent',
					fillColor: 'transparent',
					fillOpacity: 0,
					opacity: 0,
					weight: 0,
					interactive: true
				});

				touch.bindPopup(popupHtml, { maxWidth: 220, className: 'smarker-popup-container' });

				visual.addTo(map);
				touch.addTo(map);

				visualMarkers.push(visual);
				touchMarkers.push(touch);

				if (!shouldShow) {
					const vel = visual.getElement() as HTMLElement | null;
					if (vel) vel.style.display = 'none';
					const tel = touch.getElement() as HTMLElement | null;
					if (tel) tel.style.display = 'none';
				}
			}
			ft += intervalFt;
		}
	}

	$effect(() => {
		const map = ctx?.map;
		if (!map) return;
		const activeMap = map;

		clearAllMarkers(map);
		if (!visible) return;

		// Determine waypoints to use
		const useGeoJson =
			geometry != null &&
			geometry.type === 'LineString' &&
			geometry.coordinates.length >= 2;

		const useWaypoints = !useGeoJson && waypoints.length >= 2;

		if (!useGeoJson && !useWaypoints) return;

		const wps = useGeoJson ? geoJsonToWaypoints(geometry!) : waypoints;
		if (wps.length < 2) return;

		buildMarkers(map, wps, useGeoJson);

		// Zoom listener: show/hide based on zoom level
		function onZoomEnd() {
			const zoom = activeMap.getZoom();
			setMarkersVisible(zoom >= MIN_ZOOM);
		}

		map.on('zoomend', onZoomEnd);

		return () => {
			map.off('zoomend', onZoomEnd);
			clearAllMarkers(map);
		};
	});

	onDestroy(() => {
		const map = ctx?.map;
		if (map) clearAllMarkers(map);
	});
</script>

<style>
	:global(.smarker-popup-container .leaflet-popup-content-wrapper) {
		background: #1e293b;
		color: #e2e8f0;
		border: 1px solid #334155;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}

	:global(.smarker-popup-container .leaflet-popup-tip) {
		background: #1e293b;
	}

	:global(.smarker-popup) {
		font-size: 0.85rem;
		min-width: 140px;
	}

	:global(.smarker-popup strong) {
		display: block;
		font-size: 1rem;
		font-weight: 700;
		color: #f1f5f9;
		margin-bottom: 4px;
	}

	:global(.smarker-popup p) {
		margin: 2px 0;
		color: #cbd5e1;
	}

	:global(.smarker-popup p.unpaved) {
		color: #94a3b8;
		font-style: italic;
	}
</style>

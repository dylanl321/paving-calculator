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
		spread_rate_actual?: number | null;
	}

	interface Props {
		waypoints: Waypoint[];
		entries: ProgressEntry[];
		visible?: boolean;
		stationIntervalFt?: number;
	}

	let {
		waypoints,
		entries,
		visible = true,
		stationIntervalFt = 500
	}: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);
	let markers: L.CircleMarker[] = [];

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

	function stationLabel(ft: number): string {
		const station = ft / 100;
		const whole = Math.floor(station);
		const frac = Math.round((station - whole) * 100);
		return `STA ${whole}+${frac.toString().padStart(2, '0')}`;
	}

	function findEntriesAtFt(ft: number): ProgressEntry[] {
		return entries.filter((e) => {
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

	function buildPopupHtml(ft: number): string {
		const label = stationLabel(ft);
		const matching = findEntriesAtFt(ft);

		if (matching.length === 0) {
			return `<div class="smarker-popup"><strong>${label}</strong><p>Not yet paved</p></div>`;
		}

		const entry = matching[matching.length - 1];
		const dateStr = entry.log_date ? entry.log_date : 'Unknown date';
		const tonsStr = entry.tons_placed != null ? `${entry.tons_placed.toFixed(1)} tons` : '';
		const rateStr =
			entry.spread_rate_actual != null ? `${entry.spread_rate_actual.toFixed(0)} lbs/yd²` : '';

		let html = `<div class="smarker-popup"><strong>${label}</strong>`;
		html += `<p>Paved: ${dateStr}</p>`;
		if (tonsStr) html += `<p>Tons: ${tonsStr}</p>`;
		if (rateStr) html += `<p>Spread: ${rateStr}</p>`;
		if (entry.lane) html += `<p>Lane: ${entry.lane}</p>`;
		html += '</div>';
		return html;
	}

	function clearMarkers(map: L.Map) {
		for (const m of markers) map.removeLayer(m);
		markers = [];
	}

	$effect(() => {
		const map = ctx?.map;
		if (!map) return;

		clearMarkers(map);
		if (!visible || waypoints.length < 2) return;

		const routeFt = totalRouteFt(waypoints);
		let ft = 0;
		while (ft <= routeFt + 1) {
			const ll = feetToLatLng(ft, waypoints);
			if (ll) {
				const hasPaving = findEntriesAtFt(ft).length > 0;
				const marker = L.circleMarker(ll, {
					radius: 5,
					color: hasPaving ? '#22c55e' : '#6b7280',
					fillColor: hasPaving ? '#22c55e' : '#374151',
					fillOpacity: 0.9,
					weight: 2
				});
				marker.bindPopup(buildPopupHtml(ft), { maxWidth: 200 });
				marker.addTo(map);
				markers.push(marker);
			}
			ft += stationIntervalFt;
		}

		return () => {
			clearMarkers(map);
		};
	});

	onDestroy(() => {
		const map = ctx?.map;
		if (map) clearMarkers(map);
	});
</script>

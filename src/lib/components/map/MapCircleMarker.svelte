<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Props {
		lat: number;
		lng: number;
		radius?: number;
		color?: string;
		fillColor?: string;
		fillOpacity?: number;
		weight?: number;
		opacity?: number;
		/** Raw HTML popup content. */
		popupHtml?: string;
	}

	let {
		lat,
		lng,
		radius = 6,
		color = '#3b82f6',
		fillColor,
		fillOpacity = 0.6,
		weight = 2,
		opacity = 1,
		popupHtml
	}: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);

	let layer: L.CircleMarker | null = null;
	let addedMap: L.Map | null = null;

	$effect(() => {
		const map = ctx?.map;
		if (!map) return;

		const opts: L.CircleMarkerOptions = {
			radius,
			color,
			fillColor: fillColor ?? color,
			fillOpacity,
			weight,
			opacity
		};

		if (layer && addedMap === map) {
			layer.setLatLng([lat, lng]);
			layer.setStyle(opts);
			layer.setRadius(radius);
		} else {
			if (layer && addedMap) addedMap.removeLayer(layer);
			layer = L.circleMarker([lat, lng], opts).addTo(map);
			addedMap = map;
			if (popupHtml != null) {
				layer.bindPopup(popupHtml);
			}
		}
	});

	onDestroy(() => {
		if (layer && addedMap) {
			addedMap.removeLayer(layer);
		}
		layer = null;
	});
</script>

<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Props {
		/** Ring vertices as [lat, lng] pairs. */
		points: [number, number][];
		color?: string;
		fillColor?: string;
		fillOpacity?: number;
		weight?: number;
		opacity?: number;
	}

	let {
		points,
		color = '#8b5cf6',
		fillColor,
		fillOpacity = 0.2,
		weight = 1,
		opacity = 1
	}: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);

	let layer: L.Polygon | null = null;
	let addedMap: L.Map | null = null;

	$effect(() => {
		const map = ctx?.map;
		if (!map) return;

		const pts = points;
		const opts: L.PolylineOptions = { color, fillColor, fillOpacity, weight, opacity };

		if (layer && addedMap === map) {
			layer.setLatLngs(pts);
			layer.setStyle(opts);
		} else {
			if (layer && addedMap) addedMap.removeLayer(layer);
			layer = L.polygon(pts, opts).addTo(map);
			addedMap = map;
		}
	});

	onDestroy(() => {
		if (layer && addedMap) {
			addedMap.removeLayer(layer);
		}
		layer = null;
	});
</script>

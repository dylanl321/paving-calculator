<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Props {
		/** Vertices as [lat, lng] pairs. */
		points: [number, number][];
		color?: string;
		weight?: number;
		opacity?: number;
		dashArray?: string;
		lineCap?: 'butt' | 'round' | 'square';
	}

	let {
		points,
		color = '#3b82f6',
		weight = 3,
		opacity = 1,
		dashArray,
		lineCap = 'round'
	}: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);

	let layer: L.Polyline | null = null;
	let addedMap: L.Map | null = null;

	$effect(() => {
		const map = ctx?.map;
		if (!map) return;

		// Reactive: rebuild on any prop change.
		const pts = points;
		const opts: L.PolylineOptions = { color, weight, opacity, lineCap, dashArray };

		if (layer && addedMap === map) {
			layer.setLatLngs(pts);
			layer.setStyle(opts);
		} else {
			if (layer && addedMap) addedMap.removeLayer(layer);
			layer = L.polyline(pts, opts).addTo(map);
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

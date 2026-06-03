<script lang="ts">
	import { getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Props {
		mode?: 'polyline' | 'polygon' | 'point' | 'none';
		onchange?: (geojson: string) => void;
	}

	let { mode = 'none', onchange }: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);

	let drawnLayers: L.Layer[] = [];
	let currentPolyline: L.Polyline | null = null;
	let currentPoints: L.LatLng[] = [];
	let boundMap: L.Map | null = null;

	let pointCount = $state(0);

	const POLYLINE_COLOR = '#3b82f6';
	const POLYGON_COLOR = '#8b5cf6';
	const POINT_COLOR = '#22c55e';
	const MIN_TOUCH_TARGET = 48;

	function buildFeatures(layers: L.Layer[]): any[] {
		const features: any[] = [];
		for (const layer of layers) {
			if (layer instanceof L.Polyline) {
				const coords = layer.getLatLngs() as L.LatLng[];
				features.push({
					type: 'Feature',
					geometry: {
						type: layer instanceof L.Polygon ? 'Polygon' : 'LineString',
						coordinates:
							layer instanceof L.Polygon
								? [coords.map((ll) => [ll.lng, ll.lat])]
								: coords.map((ll) => [ll.lng, ll.lat])
					},
					properties: {}
				});
			} else if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
				const ll = layer.getLatLng();
				features.push({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [ll.lng, ll.lat] },
					properties: {}
				});
			}
		}
		return features;
	}

	/** Emit finished geometry. */
	function emitGeoJson() {
		if (!onchange) return;
		onchange(JSON.stringify({ type: 'FeatureCollection', features: buildFeatures(drawnLayers) }));
	}

	/**
	 * Emit in-progress geometry so the closing polygon renders live and the
	 * consumer can react to drawing progress. The active points are appended as
	 * a temporary feature alongside any already-finished layers.
	 */
	function emitProgress() {
		if (!onchange) return;
		const features = buildFeatures(drawnLayers);
		if (currentPoints.length > 0 && (mode === 'polyline' || mode === 'polygon')) {
			features.push({
				type: 'Feature',
				geometry:
					mode === 'polygon'
						? { type: 'Polygon', coordinates: [currentPoints.map((ll) => [ll.lng, ll.lat])] }
						: { type: 'LineString', coordinates: currentPoints.map((ll) => [ll.lng, ll.lat]) },
				properties: { inProgress: true }
			});
		}
		onchange(JSON.stringify({ type: 'FeatureCollection', features }));
	}

	function bindDeletePopup(layer: L.Layer) {
		const map = boundMap;
		if (!map) return;
		const popupContent = document.createElement('div');
		popupContent.innerHTML = `<button class="delete-feature-btn" style="min-width: ${MIN_TOUCH_TARGET}px; min-height: ${MIN_TOUCH_TARGET}px; padding: 12px 20px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Delete</button>`;
		const btn = popupContent.querySelector('.delete-feature-btn') as HTMLButtonElement;
		btn.addEventListener('click', () => {
			map.closePopup();
			map.removeLayer(layer);
			drawnLayers = drawnLayers.filter((l) => l !== layer);
			emitGeoJson();
		});

		if (
			layer instanceof L.Marker ||
			layer instanceof L.CircleMarker ||
			layer instanceof L.Polyline
		) {
			layer.bindPopup(popupContent);
		}
	}

	function addPointAt(latlng: L.LatLng) {
		const map = boundMap;
		if (!map || mode === 'none') return;

		if (mode === 'point') {
			const marker = L.circleMarker(latlng, {
				color: POINT_COLOR,
				fillColor: POINT_COLOR,
				fillOpacity: 0.7,
				radius: 8
			}).addTo(map);
			bindDeletePopup(marker);
			drawnLayers.push(marker);
			emitGeoJson();
			return;
		}

		currentPoints.push(latlng);
		pointCount = currentPoints.length;

		const renderPoints =
			mode === 'polygon' && currentPoints.length > 2
				? [...currentPoints, currentPoints[0]]
				: currentPoints;

		if (currentPolyline) {
			currentPolyline.setLatLngs(renderPoints);
		} else {
			currentPolyline = L.polyline(renderPoints, {
				color: mode === 'polygon' ? POLYGON_COLOR : POLYLINE_COLOR,
				weight: 3,
				dashArray: '5, 5'
			}).addTo(map);
		}

		emitProgress();
	}

	function handleMapClick(e: L.LeafletMouseEvent) {
		addPointAt(e.latlng);
	}

	function handleCenterAdd() {
		const map = boundMap;
		if (!map) return;
		addPointAt(map.getCenter());
	}

	function undoPoint() {
		const map = boundMap;
		if (!map) return;
		if (currentPoints.length === 0) return;

		currentPoints.pop();
		pointCount = currentPoints.length;

		if (currentPoints.length === 0) {
			if (currentPolyline) {
				map.removeLayer(currentPolyline);
				currentPolyline = null;
			}
		} else if (currentPolyline) {
			const renderPoints =
				mode === 'polygon' && currentPoints.length > 2
					? [...currentPoints, currentPoints[0]]
					: currentPoints;
			currentPolyline.setLatLngs(renderPoints);
		}

		emitProgress();
	}

	function cancelDrawing() {
		const map = boundMap;
		if (currentPolyline && map) {
			map.removeLayer(currentPolyline);
		}
		currentPolyline = null;
		currentPoints = [];
		pointCount = 0;
		emitProgress();
	}

	function finishDrawing() {
		const map = boundMap;
		if (!map) return;

		const minPoints = mode === 'polygon' ? 3 : 2;
		if (currentPoints.length < minPoints) {
			cancelDrawing();
			return;
		}

		if (currentPolyline) {
			map.removeLayer(currentPolyline);
		}

		let finalLayer: L.Polyline | L.Polygon;
		if (mode === 'polygon') {
			finalLayer = L.polygon(currentPoints, {
				color: POLYGON_COLOR,
				weight: 3,
				fillOpacity: 0.2
			}).addTo(map);
		} else {
			finalLayer = L.polyline(currentPoints, {
				color: POLYLINE_COLOR,
				weight: 3
			}).addTo(map);
		}

		bindDeletePopup(finalLayer);
		drawnLayers.push(finalLayer);
		currentPolyline = null;
		currentPoints = [];
		pointCount = 0;
		emitGeoJson();
	}

	function handleDblClick() {
		if (mode === 'polygon' || mode === 'polyline') {
			finishDrawing();
		}
	}

	function bind(map: L.Map) {
		map.on('click', handleMapClick);
		map.on('dblclick', handleDblClick);
		boundMap = map;
	}

	function unbind(map: L.Map) {
		map.off('click', handleMapClick);
		map.off('dblclick', handleDblClick);
		if (currentPolyline) {
			map.removeLayer(currentPolyline);
		}
		for (const layer of drawnLayers) {
			map.removeLayer(layer);
		}
		drawnLayers = [];
		currentPolyline = null;
		currentPoints = [];
		pointCount = 0;
		if (boundMap === map) boundMap = null;
	}

	// Children mount before the parent's onMount, so pick up the map once the
	// reactive context publishes it (mirrors MapPolyline / MapPolygon). The
	// effect cleanup unbinds on map change or component destroy.
	$effect(() => {
		const map = ctx?.map;
		if (!map || boundMap === map) return;
		bind(map);
		return () => unbind(map);
	});

	const showFinishControls = $derived(mode === 'polygon' || mode === 'polyline');
	const canFinish = $derived(pointCount >= (mode === 'polygon' ? 3 : 2));
</script>

{#if mode !== 'none'}
	{#if mode !== 'point'}
		<div class="map-drawing-crosshair" aria-hidden="true">
			<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="16" cy="16" r="10" stroke-dasharray="2 2" />
				<line x1="16" y1="0" x2="16" y2="12" />
				<line x1="16" y1="20" x2="16" y2="32" />
				<line x1="0" y1="16" x2="12" y2="16" />
				<line x1="20" y1="16" x2="32" y2="16" />
			</svg>
		</div>
	{/if}

	<div class="map-drawing-controls">
		<button type="button" class="map-drawing-btn add" onclick={handleCenterAdd}>Add Point</button>
		{#if showFinishControls}
			<button
				type="button"
				class="map-drawing-btn undo"
				onclick={undoPoint}
				disabled={pointCount === 0}
			>
				Undo
			</button>
			<button
				type="button"
				class="map-drawing-btn finish"
				onclick={finishDrawing}
				disabled={!canFinish}
			>
				Finish
			</button>
		{/if}
		{#if pointCount > 0}
			<button type="button" class="map-drawing-btn cancel" onclick={cancelDrawing}>Cancel</button>
		{/if}
	</div>
{/if}

<style>
	.map-drawing-crosshair {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: #3b82f6;
		pointer-events: none;
		z-index: 500;
		opacity: 0.8;
	}

	.map-drawing-controls {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		gap: 8px;
		z-index: 600;
		padding: 6px;
		background: rgba(0, 0, 0, 0.55);
		border-radius: 12px;
		backdrop-filter: blur(4px);
	}

	.map-drawing-btn {
		min-width: 48px;
		min-height: 48px;
		padding: 12px 18px;
		border: none;
		border-radius: 8px;
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
		transition: transform 0.1s ease;
	}

	.map-drawing-btn:active:not(:disabled) {
		transform: scale(0.95);
	}

	.map-drawing-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.map-drawing-btn.add {
		background: #3b82f6;
	}

	.map-drawing-btn.undo {
		background: #64748b;
	}

	.map-drawing-btn.finish {
		background: #22c55e;
	}

	.map-drawing-btn.cancel {
		background: #ef4444;
	}
</style>

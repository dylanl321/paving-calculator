<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Props {
		/** Optional: pass a map directly, or omit to read it from MapContainer context. */
		map?: L.Map;
		mode?: 'polyline' | 'polygon' | 'point' | 'none';
		geojson?: string | null;
		onchange?: (geojson: string) => void;
	}

	let { map: mapProp, mode = 'none', geojson = null, onchange }: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);
	const map = $derived(mapProp ?? ctx?.map ?? null) as L.Map | null;

	let drawnLayers: L.Layer[] = [];
	let currentPolyline: L.Polyline | null = null;
	let currentPoints: L.LatLng[] = [];
	let crosshairEl: HTMLDivElement | null = null;
	let addPointBtn: HTMLButtonElement | null = null;
	let isMobile = false;

	const POLYLINE_COLOR = '#3b82f6';
	const POLYGON_COLOR = '#8b5cf6';
	const POINT_COLOR = '#22c55e';
	const MIN_TOUCH_TARGET = 48;

	function detectMobile(): boolean {
		return window.matchMedia('(max-width: 640px)').matches;
	}

	function emitGeoJson() {
		if (!onchange) return;

		const features: any[] = [];
		for (const layer of drawnLayers) {
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
			} else if (layer instanceof L.Marker) {
				const ll = layer.getLatLng();
				features.push({
					type: 'Feature',
					geometry: {
						type: 'Point',
						coordinates: [ll.lng, ll.lat]
					},
					properties: {}
				});
			}
		}

		const geoJsonObj = {
			type: 'FeatureCollection',
			features
		};

		onchange(JSON.stringify(geoJsonObj));
	}

	function loadGeoJson() {
		if (!geojson) return;

		try {
			const parsed = JSON.parse(geojson);
			if (parsed.type === 'FeatureCollection') {
				for (const feature of parsed.features) {
					if (feature.geometry.type === 'LineString') {
						const coords = feature.geometry.coordinates.map((c: number[]) =>
							L.latLng(c[1], c[0])
						);
						const polyline = L.polyline(coords, {
							color: POLYLINE_COLOR,
							weight: 3
						}).addTo(map);
						bindDeletePopup(polyline);
						drawnLayers.push(polyline);
					} else if (feature.geometry.type === 'Polygon') {
						const coords = feature.geometry.coordinates[0].map((c: number[]) =>
							L.latLng(c[1], c[0])
						);
						const polygon = L.polygon(coords, {
							color: POLYGON_COLOR,
							weight: 3,
							fillOpacity: 0.2
						}).addTo(map);
						bindDeletePopup(polygon);
						drawnLayers.push(polygon);
					} else if (feature.geometry.type === 'Point') {
						const ll = L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
						const marker = L.circleMarker(ll, {
							color: POINT_COLOR,
							fillColor: POINT_COLOR,
							fillOpacity: 0.7,
							radius: 8
						}).addTo(map);
						bindDeletePopup(marker);
						drawnLayers.push(marker);
					}
				}
			}
		} catch (err) {
			console.error('Failed to load GeoJSON:', err);
		}
	}

	function bindDeletePopup(layer: L.Layer) {
		const popupContent = document.createElement('div');
		popupContent.innerHTML = `<button class="delete-feature-btn" style="min-width: ${MIN_TOUCH_TARGET}px; min-height: ${MIN_TOUCH_TARGET}px; padding: 12px 20px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">Delete</button>`;
		const btn = popupContent.querySelector('.delete-feature-btn') as HTMLButtonElement;
		btn.addEventListener('click', () => {
			map.closePopup();
			map.removeLayer(layer);
			drawnLayers = drawnLayers.filter((l) => l !== layer);
			emitGeoJson();
		});

		if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
			layer.bindPopup(popupContent);
		} else if (layer instanceof L.Polyline) {
			layer.bindPopup(popupContent);
		}
	}

	function handleMapClick(e: L.LeafletMouseEvent) {
		if (mode === 'none') return;

		if (mode === 'point') {
			const marker = L.circleMarker(e.latlng, {
				color: POINT_COLOR,
				fillColor: POINT_COLOR,
				fillOpacity: 0.7,
				radius: 8
			}).addTo(map);
			bindDeletePopup(marker);
			drawnLayers.push(marker);
			emitGeoJson();
		} else if (mode === 'polyline' || mode === 'polygon') {
			currentPoints.push(e.latlng);

			if (currentPolyline) {
				currentPolyline.setLatLngs(currentPoints);
			} else {
				currentPolyline = L.polyline(currentPoints, {
					color: mode === 'polygon' ? POLYGON_COLOR : POLYLINE_COLOR,
					weight: 3,
					dashArray: '5, 5'
				}).addTo(map);
			}
		}
	}

	function handleMobileAddPoint() {
		if (!map || mode === 'none') return;

		const center = map.getCenter();

		if (mode === 'point') {
			const marker = L.circleMarker(center, {
				color: POINT_COLOR,
				fillColor: POINT_COLOR,
				fillOpacity: 0.7,
				radius: 8
			}).addTo(map);
			bindDeletePopup(marker);
			drawnLayers.push(marker);
			emitGeoJson();
		} else if (mode === 'polyline' || mode === 'polygon') {
			currentPoints.push(center);

			if (currentPolyline) {
				currentPolyline.setLatLngs(currentPoints);
			} else {
				currentPolyline = L.polyline(currentPoints, {
					color: mode === 'polygon' ? POLYGON_COLOR : POLYLINE_COLOR,
					weight: 3,
					dashArray: '5, 5'
				}).addTo(map);
			}
		}
	}

	function finishDrawing() {
		if (!currentPolyline || currentPoints.length < 2) {
			currentPolyline = null;
			currentPoints = [];
			return;
		}

		map.removeLayer(currentPolyline);

		let finalLayer: L.Polyline;
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
		emitGeoJson();
	}

	function handleDblClick() {
		if (mode === 'polygon') {
			finishDrawing();
		}
	}

	onMount(() => {
		if (!map) return;

		isMobile = detectMobile();
		loadGeoJson();

		map.on('click', handleMapClick);
		map.on('dblclick', handleDblClick);

		// Create mobile UI
		if (isMobile) {
			const mapContainer = map.getContainer();

			// Crosshair
			crosshairEl = document.createElement('div');
			crosshairEl.className = 'map-drawing-crosshair';
			crosshairEl.innerHTML = `<svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="16" cy="16" r="10" stroke-dasharray="2 2"/>
				<line x1="16" y1="0" x2="16" y2="12"/>
				<line x1="16" y1="20" x2="16" y2="32"/>
				<line x1="0" y1="16" x2="12" y2="16"/>
				<line x1="20" y1="16" x2="32" y2="16"/>
			</svg>`;
			mapContainer.appendChild(crosshairEl);

			// Add Point button
			addPointBtn = document.createElement('button');
			addPointBtn.className = 'map-drawing-add-btn';
			addPointBtn.style.minWidth = `${MIN_TOUCH_TARGET}px`;
			addPointBtn.style.minHeight = `${MIN_TOUCH_TARGET}px`;
			addPointBtn.textContent = 'Add Point';
			addPointBtn.addEventListener('click', handleMobileAddPoint);
			mapContainer.appendChild(addPointBtn);

			// Finish button for polygon/polyline
			if (mode === 'polygon' || mode === 'polyline') {
				const finishBtn = document.createElement('button');
				finishBtn.className = 'map-drawing-finish-btn';
				finishBtn.style.minWidth = `${MIN_TOUCH_TARGET}px`;
				finishBtn.style.minHeight = `${MIN_TOUCH_TARGET}px`;
				finishBtn.textContent = 'Finish';
				finishBtn.addEventListener('click', finishDrawing);
				mapContainer.appendChild(finishBtn);
			}
		}
	});

	onDestroy(() => {
		if (!map) return;

		map.off('click', handleMapClick);
		map.off('dblclick', handleDblClick);

		for (const layer of drawnLayers) {
			map.removeLayer(layer);
		}
		if (currentPolyline) {
			map.removeLayer(currentPolyline);
		}

		if (crosshairEl) {
			crosshairEl.remove();
		}
		if (addPointBtn) {
			addPointBtn.remove();
		}
	});
</script>

<style>
	:global(.map-drawing-crosshair) {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: #3b82f6;
		pointer-events: none;
		z-index: 500;
		opacity: 0.8;
	}

	:global(.map-drawing-add-btn),
	:global(.map-drawing-finish-btn) {
		position: absolute;
		bottom: 20px;
		padding: 12px 24px;
		background: #3b82f6;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		z-index: 500;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	:global(.map-drawing-add-btn) {
		right: 20px;
	}

	:global(.map-drawing-finish-btn) {
		right: 140px;
		background: #22c55e;
	}

	:global(.map-drawing-add-btn:active),
	:global(.map-drawing-finish-btn:active) {
		transform: scale(0.95);
	}
</style>

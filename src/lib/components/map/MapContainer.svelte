<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import L from 'leaflet';
	import 'leaflet/dist/leaflet.css';
	import { setContext } from 'svelte';

	interface Props {
		center?: [number, number];
		zoom?: number;
		bounds?: [[number, number], [number, number]];
		class?: string;
		style?: string;
		height?: string;
		map?: L.Map;
	}

	let {
		center,
		zoom = 13,
		bounds,
		class: className = '',
		style = '',
		height = '320px',
		map = $bindable()
	}: Props = $props();

	let mapEl: HTMLDivElement;
	let tileLayer: L.TileLayer | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let themeObserver: MutationObserver | null = null;
	let isDark = $state(false);

	const TILE_LAYERS = {
		dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
		light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
	};

	const TILE_ATTRIBUTION =
		'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

	const MIN_TOUCH_TARGET = 48;

	function updateTileLayer() {
		if (!map || !tileLayer) return;
		const newUrl = isDark ? TILE_LAYERS.dark : TILE_LAYERS.light;
		tileLayer.setUrl(newUrl);
	}

	function checkTheme() {
		if (!browser) return;
		isDark = document.documentElement.classList.contains('dark');
	}

	onMount(() => {
		if (!browser) return;

		// Initialize theme
		checkTheme();

		// Create map
		map = L.map(mapEl, {
			zoomControl: true,
			attributionControl: true,
			scrollWheelZoom: false // Enable on focus for mobile
		});

		// Set initial view
		if (bounds) {
			map.fitBounds(bounds, { padding: [30, 30] });
		} else if (center) {
			map.setView(center, zoom);
		} else {
			// Default to US center
			map.setView([39.8283, -98.5795], 4);
		}

		// Add tile layer
		tileLayer = L.tileLayer(isDark ? TILE_LAYERS.dark : TILE_LAYERS.light, {
			attribution: TILE_ATTRIBUTION,
			maxZoom: 19
		}).addTo(map);

		// Optional Mapbox satellite layer
		const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
		if (mapboxToken) {
			try {
				L.tileLayer(
					`https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
					{
						attribution: '&copy; <a href="https://www.mapbox.com/">Mapbox</a>',
						maxZoom: 19,
						tileSize: 512,
						zoomOffset: -1
					}
				);
			} catch (err) {
				console.warn('Mapbox satellite layer failed to load:', err);
			}
		}

		// Enable scroll zoom on focus (mobile UX)
		map.on('focus', () => {
			map.scrollWheelZoom.enable();
		});
		map.on('blur', () => {
			map.scrollWheelZoom.disable();
		});

		// Ensure touch targets are large enough
		const zoomControls = mapEl.querySelectorAll('.leaflet-control-zoom a');
		zoomControls.forEach((el) => {
			const htmlEl = el as HTMLElement;
			htmlEl.style.minWidth = `${MIN_TOUCH_TARGET}px`;
			htmlEl.style.minHeight = `${MIN_TOUCH_TARGET}px`;
			htmlEl.style.lineHeight = `${MIN_TOUCH_TARGET}px`;
		});

		// Watch for theme changes
		themeObserver = new MutationObserver(() => {
			checkTheme();
			updateTileLayer();
		});
		themeObserver.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});

		// Handle resize
		resizeObserver = new ResizeObserver(() => {
			if (map) {
				map.invalidateSize();
			}
		});
		resizeObserver.observe(mapEl);

		// Set context for child components
		setContext('leafletMap', map);
	});

	onDestroy(() => {
		if (themeObserver) {
			themeObserver.disconnect();
		}
		if (resizeObserver) {
			resizeObserver.disconnect();
		}
		if (map) {
			map.remove();
			map = undefined as any;
		}
	});
</script>

<div
	bind:this={mapEl}
	class="map-container {className}"
	{style}
	style:height={height}
	role="application"
	aria-label="Interactive map"
>
	<slot />
</div>

<style>
	.map-container {
		width: 100%;
		position: relative;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
	}

	.map-container :global(.leaflet-pane) {
		z-index: 1;
	}

	.map-container :global(.leaflet-top),
	.map-container :global(.leaflet-bottom) {
		z-index: 2;
	}

	.map-container :global(.leaflet-control-zoom a) {
		display: flex;
		align-items: center;
		justify-content: center;
	}
</style>

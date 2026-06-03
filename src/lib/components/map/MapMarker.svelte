<script lang="ts">
	import { onMount, onDestroy, getContext } from 'svelte';
	import L from 'leaflet';

	interface Props {
		lat: number;
		lng: number;
		status?: 'active' | 'paused' | 'complete' | 'default';
		title?: string;
		clusterId?: string;
		children?: import('svelte').Snippet;
	}

	let { lat, lng, status = 'default', title, clusterId, children }: Props = $props();

	let marker: L.Marker | null = null;
	let map: L.Map | null = null;

	const STATUS_COLORS = {
		active: '#22c55e',
		paused: '#f59e0b',
		complete: '#94a3b8',
		default: '#3b82f6'
	};

	function createPinSvg(color: string): string {
		return `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M14 0C6.268 0 0 6.268 0 14C0 21.732 14 36 14 36C14 36 28 21.732 28 14C28 6.268 21.732 0 14 0Z" fill="${color}"/>
			<circle cx="14" cy="14" r="5" fill="white"/>
		</svg>`;
	}

	onMount(() => {
		map = getContext('leafletMap');
		if (!map) {
			console.error('MapMarker must be used inside MapContainer');
			return;
		}

		const color = STATUS_COLORS[status];
		const iconHtml = createPinSvg(color);

		const icon = L.divIcon({
			html: iconHtml,
			className: 'map-marker-icon',
			iconSize: [28, 36],
			iconAnchor: [14, 36],
			popupAnchor: [0, -36]
		});

		marker = L.marker([lat, lng], {
			icon,
			title: title || ''
		}).addTo(map);

		// Bind popup if slot content provided
		if (children) {
			const popupEl = document.createElement('div');
			popupEl.className = 'map-marker-popup';
			marker.bindPopup(popupEl);
		}
	});

	onDestroy(() => {
		if (marker && map) {
			map.removeLayer(marker);
		}
	});
</script>

{#if children}
	<div class="popup-content">
		{@render children()}
	</div>
{/if}

<style>
	:global(.map-marker-icon) {
		background: transparent !important;
		border: none !important;
	}

	.popup-content {
		display: none;
	}

	:global(.map-marker-popup) {
		min-width: 200px;
		padding: 8px;
	}
</style>

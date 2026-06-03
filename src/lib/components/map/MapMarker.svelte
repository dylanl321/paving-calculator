<script lang="ts">
	import { onDestroy, getContext } from 'svelte';
	import L from 'leaflet';
	import { MAP_CONTEXT_KEY, type MapContext } from './mapContext';

	interface Props {
		lat: number;
		lng: number;
		status?: 'active' | 'paused' | 'complete' | 'default';
		title?: string;
		clusterId?: string;
		/** Snippet popup content (rendered into the marker popup). */
		children?: import('svelte').Snippet;
		/** Override the pin fill color (otherwise derived from `status`). */
		color?: string;
		/** Custom divIcon HTML; replaces the default pin entirely. */
		iconHtml?: string;
		iconSize?: [number, number];
		iconAnchor?: [number, number];
		popupAnchor?: [number, number];
		/** Raw HTML popup content (alternative to the `children` snippet). */
		popupHtml?: string;
		/** Minimum popup width in px. */
		popupMinWidth?: number;
	}

	let {
		lat,
		lng,
		status = 'default',
		title,
		clusterId,
		children,
		color,
		iconHtml,
		iconSize,
		iconAnchor,
		popupAnchor,
		popupHtml,
		popupMinWidth = 200
	}: Props = $props();

	const ctx = getContext<MapContext>(MAP_CONTEXT_KEY);

	let marker: L.Marker | null = null;
	let addedMap: L.Map | null = null;
	let popupEl: HTMLDivElement | null = null;

	const STATUS_COLORS = {
		active: '#22c55e',
		paused: '#f59e0b',
		complete: '#94a3b8',
		default: '#3b82f6'
	};

	function defaultPinSvg(fill: string): string {
		return `<svg width="28" height="36" viewBox="0 0 28 36" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path d="M14 0C6.268 0 0 6.268 0 14C0 21.732 14 36 14 36C14 36 28 21.732 28 14C28 6.268 21.732 0 14 0Z" fill="${fill}"/>
			<circle cx="14" cy="14" r="5" fill="white"/>
		</svg>`;
	}

	function buildIcon(): L.DivIcon {
		const fill = color ?? STATUS_COLORS[status];
		const html = iconHtml ?? defaultPinSvg(fill);
		return L.divIcon({
			html,
			className: 'map-marker-icon',
			iconSize: iconSize ?? [28, 36],
			iconAnchor: iconAnchor ?? [14, 36],
			popupAnchor: popupAnchor ?? [0, -36]
		});
	}

	// Add the marker once the map becomes available via context.
	$effect(() => {
		const map = ctx?.map;
		if (!map || marker) return;

		marker = L.marker([lat, lng], {
			icon: buildIcon(),
			title: title || ''
		}).addTo(map);
		addedMap = map;

		if (popupHtml != null) {
			marker.bindPopup(popupHtml, { minWidth: popupMinWidth });
		} else if (children) {
			popupEl = document.createElement('div');
			popupEl.className = 'map-marker-popup';
			marker.bindPopup(popupEl, { minWidth: popupMinWidth });
		}
	});

	onDestroy(() => {
		if (marker && addedMap) {
			addedMap.removeLayer(marker);
		}
		marker = null;
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

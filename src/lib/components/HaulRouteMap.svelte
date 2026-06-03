<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import L from 'leaflet';
	import 'leaflet/dist/leaflet.css';

	interface Site {
		id: string;
		name: string;
		latitude: number | null;
		longitude: number | null;
	}

	interface Plant {
		name: string;
		latitude: number | null;
		longitude: number | null;
	}

	interface Props {
		site: Site;
		plant: Plant;
		avgSpeedMph?: number;
		height?: string;
	}

	let { site, plant, avgSpeedMph = 30, height = '280px' }: Props = $props();

	let mapEl: HTMLDivElement;
	let mapInstance: L.Map | null = null;
	let loading = $state(true);

	const hasSite = $derived(site.latitude != null && site.longitude != null);
	const hasPlant = $derived(plant.latitude != null && plant.longitude != null);
	const canShowRoute = $derived(hasSite && hasPlant);

	// Haversine distance in miles
	function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const R = 3958.8; // Earth radius in miles
		const phi1 = (lat1 * Math.PI) / 180;
		const phi2 = (lat2 * Math.PI) / 180;
		const dphi = ((lat2 - lat1) * Math.PI) / 180;
		const dlambda = ((lon2 - lon1) * Math.PI) / 180;
		const a =
			Math.sin(dphi / 2) * Math.sin(dphi / 2) +
			Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) * Math.sin(dlambda / 2);
		return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	}

	const distanceMi = $derived.by(() => {
		if (!canShowRoute) return null;
		return haversineMiles(
			plant.latitude as number,
			plant.longitude as number,
			site.latitude as number,
			site.longitude as number
		);
	});

	const distanceKm = $derived.by(() => {
		if (distanceMi == null) return null;
		return distanceMi * 1.60934;
	});

	const driveTimeMin = $derived.by(() => {
		if (distanceMi == null) return null;
		return (distanceMi / avgSpeedMph) * 60;
	});

	const roundTripMin = $derived.by(() => {
		if (driveTimeMin == null) return null;
		return driveTimeMin * 2;
	});

	function createSiteIcon(): L.DivIcon {
		return L.divIcon({
			html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
				<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#f2c037" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
				<circle cx="14" cy="14" r="5" fill="rgba(255,255,255,0.9)"/>
			</svg>`,
			className: '',
			iconSize: [28, 36],
			iconAnchor: [14, 36],
			popupAnchor: [0, -40]
		});
	}

	function createPlantIcon(): L.DivIcon {
		return L.divIcon({
			html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
				<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="#3b82f6" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
				<circle cx="14" cy="14" r="5" fill="rgba(255,255,255,0.9)"/>
			</svg>`,
			className: '',
			iconSize: [28, 36],
			iconAnchor: [14, 36],
			popupAnchor: [0, -40]
		});
	}

	function initMap() {
		if (!browser || !mapEl || !canShowRoute) return;
		if (mapInstance) return;

		mapInstance = L.map(mapEl, { zoomControl: true });

		const isDark = document.documentElement.classList.contains('dark');
		const tileUrl = isDark
			? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
			: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

		L.tileLayer(tileUrl, {
			attribution: '&copy; <a href="https://carto.com">CARTO</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		// Add plant marker
		const plantMarker = L.marker([plant.latitude as number, plant.longitude as number], {
			icon: createPlantIcon()
		}).addTo(mapInstance);
		plantMarker.bindPopup(`<div style="font-size:0.85rem;line-height:1.5"><strong>${plant.name}</strong><br>Asphalt Plant</div>`);

		// Add site marker
		const siteMarker = L.marker([site.latitude as number, site.longitude as number], {
			icon: createSiteIcon()
		}).addTo(mapInstance);
		siteMarker.bindPopup(`<div style="font-size:0.85rem;line-height:1.5"><strong>${site.name}</strong><br>Job Site</div>`);

		// Draw dashed route line
		L.polyline(
			[
				[plant.latitude as number, plant.longitude as number],
				[site.latitude as number, site.longitude as number]
			],
			{
				color: '#f59e0b',
				weight: 3,
				opacity: 0.75,
				dashArray: '8 6'
			}
		).addTo(mapInstance);

		// Fit bounds to show both markers
		const bounds = L.latLngBounds([
			[plant.latitude as number, plant.longitude as number],
			[site.latitude as number, site.longitude as number]
		]);
		mapInstance.fitBounds(bounds, { padding: [40, 40] });

		loading = false;
	}

	onMount(() => {
		if (browser && canShowRoute) {
			initMap();
		} else {
			loading = false;
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
	});
</script>

{#if !canShowRoute}
	<div class="empty-state">
		<svg
			width="28"
			height="28"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<rect x="1" y="3" width="15" height="13"></rect>
			<polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
			<circle cx="5.5" cy="18.5" r="2.5"></circle>
			<circle cx="18.5" cy="18.5" r="2.5"></circle>
		</svg>
		<p>Set both plant and job site locations to see the haul route.</p>
	</div>
{:else}
	<div class="map-wrap" style="height:{height}">
		<div bind:this={mapEl} class="map-el"></div>
		{#if loading}
			<div class="map-loading" aria-live="polite">Loading map&hellip;</div>
		{/if}
	</div>

	<div class="route-info-card">
		<div class="route-info-header">
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<rect x="1" y="3" width="15" height="13"></rect>
				<polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
				<circle cx="5.5" cy="18.5" r="2.5"></circle>
				<circle cx="18.5" cy="18.5" r="2.5"></circle>
			</svg>
			<h4>Haul Distance</h4>
		</div>
		<div class="route-info-stats">
			<div class="route-stat">
				<span class="route-stat-label">One-way</span>
				<span class="route-stat-value"
					>{distanceMi?.toFixed(1)} mi <span class="route-stat-alt">({distanceKm?.toFixed(1)} km)</span></span
				>
			</div>
			<div class="route-stat">
				<span class="route-stat-label">Drive time</span>
				<span class="route-stat-value"
					>~{Math.round(driveTimeMin ?? 0)} min one-way <span class="route-stat-alt">| ~{Math.round(roundTripMin ?? 0)} min round trip</span></span
				>
			</div>
		</div>
		<div class="route-info-note">Straight-line estimate at {avgSpeedMph} mph avg</div>
	</div>
{/if}

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 32px 20px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-state svg {
		opacity: 0.4;
	}

	.empty-state p {
		margin: 0;
		font-size: 0.875rem;
	}

	.map-wrap {
		position: relative;
		width: 100%;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
		margin-bottom: 12px;
	}

	.map-el {
		width: 100%;
		height: 100%;
	}

	.map-el :global(.leaflet-pane) {
		z-index: 1;
	}
	.map-el :global(.leaflet-top),
	.map-el :global(.leaflet-bottom) {
		z-index: 2;
	}

	.map-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 600;
		z-index: 600;
		pointer-events: none;
	}

	.route-info-card {
		background: var(--surface, #1f2937);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		padding: 16px;
	}

	.route-info-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.route-info-header svg {
		color: var(--accent);
	}

	.route-info-header h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.route-info-stats {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 10px;
	}

	.route-stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.route-stat-label {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.route-stat-value {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
	}

	.route-stat-alt {
		font-size: 0.875rem;
		font-weight: 400;
		color: var(--text-muted);
	}

	.route-info-note {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-style: italic;
	}

	@media (max-width: 640px) {
		.route-info-card {
			padding: 14px;
		}

		.route-stat-value {
			font-size: 0.95rem;
		}

		.route-stat-alt {
			display: block;
			margin-top: 2px;
		}
	}
</style>

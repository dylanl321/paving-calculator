<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import L from 'leaflet';
	import 'leaflet/dist/leaflet.css';

	interface SitePin {
		id: string;
		name: string;
		status: 'active' | 'completed' | 'archived';
		latitude: number | null;
		longitude: number | null;
		location_description?: string | null;
	}

	interface Props {
		sites: SitePin[];
		height?: string;
	}

	let { sites, height = '320px' }: Props = $props();

	let mapEl: HTMLDivElement;
	let mapInstance: L.Map | null = null;

	const STATUS_COLORS: Record<string, string> = {
		active: '#22c55e',
		completed: '#94a3b8',
		archived: '#475569'
	};

	const pinned = $derived(sites.filter((s) => s.latitude != null && s.longitude != null));

	function initMap() {
		if (!browser || !mapEl || pinned.length === 0) return;

		// Destroy any existing instance
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}

		mapInstance = L.map(mapEl, {
			zoomControl: true,
			attributionControl: true
		});

		L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		const bounds: [number, number][] = [];

		for (const site of pinned) {
			const lat = site.latitude as number;
			const lng = site.longitude as number;
			bounds.push([lat, lng]);

			const color = STATUS_COLORS[site.status] ?? STATUS_COLORS.active;
			const icon = L.divIcon({
				html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
					<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
					<circle cx="14" cy="14" r="5" fill="#fff"/>
				</svg>`,
				className: '',
				iconSize: [28, 36],
				iconAnchor: [14, 36],
				popupAnchor: [0, -36]
			});

			const statusLabel = site.status.charAt(0).toUpperCase() + site.status.slice(1);
			const popup = L.popup().setContent(
				`<div style="min-width:160px;font-family:system-ui,sans-serif">
					<strong style="font-size:0.95rem">${site.name}</strong><br>
					<span style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>
					${site.location_description ? `<br><span style="font-size:0.8rem;color:#666">${site.location_description}</span>` : ''}
					<br><a href="/dashboard/job-sites/${site.id}" style="display:inline-block;margin-top:8px;font-size:0.82rem;color:#2563eb;text-decoration:underline">Open job site</a>
				</div>`
			);

			L.marker([lat, lng], { icon }).bindPopup(popup).addTo(mapInstance);
		}

		if (bounds.length === 1) {
			mapInstance.setView(bounds[0], 13);
		} else if (bounds.length > 1) {
			mapInstance.fitBounds(bounds, { padding: [32, 32] });
		} else {
			mapInstance.setView([39.5, -98.35], 4);
		}
	}

	onMount(() => {
		if (browser && pinned.length > 0) {
			initMap();
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
	});
</script>

{#if pinned.length === 0}
	<div class="empty-map">
		<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
			<circle cx="12" cy="10" r="3"></circle>
		</svg>
		<p>No coordinates set — edit job sites to add a location.</p>
	</div>
{:else}
	<div class="map-wrap" style="height:{height}">
		<div bind:this={mapEl} class="map-el"></div>
	</div>
{/if}

<style>
	.map-wrap {
		width: 100%;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-el {
		width: 100%;
		height: 100%;
	}

	/* Prevent Leaflet z-index from bleeding over modals */
	.map-el :global(.leaflet-pane) {
		z-index: 1;
	}
	.map-el :global(.leaflet-top),
	.map-el :global(.leaflet-bottom) {
		z-index: 2;
	}

	.empty-map {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 40px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-map svg {
		opacity: 0.4;
	}

	.empty-map p {
		margin: 0;
		font-size: 0.875rem;
	}
</style>

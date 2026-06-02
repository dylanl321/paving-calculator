<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		jobSiteId: string;
		lat: number;
		lng: number;
		zoom?: number;
		dailyLogId?: string;
		height?: string;
	}

	let { jobSiteId, lat, lng, zoom = 16, dailyLogId, height = '400px' }: Props = $props();

	interface Photo {
		id: string;
		filename: string;
		caption: string | null;
		lat: number | null;
		lng: number | null;
		taken_at: number;
	}

	let mapEl: HTMLDivElement;
	let mapInstance: any = null;
	let photos = $state<Photo[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let markers: any[] = [];

	const photosWithGPS = $derived(photos.filter((p) => p.lat != null && p.lng != null));

	async function loadPhotos() {
		loading = true;
		error = null;
		try {
			const url = dailyLogId
				? `/api/job-sites/${jobSiteId}/photos?log_id=${dailyLogId}`
				: `/api/job-sites/${jobSiteId}/photos`;

			const res = await fetch(url);
			if (!res.ok) throw new Error('Failed to load photos');

			const data = await res.json();
			photos = data.photos ?? [];
		} catch (err) {
			error = 'Could not load photos';
		} finally {
			loading = false;
		}
	}

	onMount(async () => {
		await loadPhotos();

		if (photosWithGPS.length === 0) {
			// No GPS photos, don't initialize map
			return;
		}

		// Load Leaflet from CDN (same pattern as StationProgressMap)
		if (!document.querySelector('link[href*="leaflet"]')) {
			const link = document.createElement('link');
			link.rel = 'stylesheet';
			link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
			document.head.appendChild(link);
		}

		if (!(window as any).L) {
			await new Promise<void>((resolve, reject) => {
				const script = document.createElement('script');
				script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
				script.onload = () => resolve();
				script.onerror = () => reject(new Error('Failed to load Leaflet'));
				document.head.appendChild(script);
			});
		}

		const L = (window as any).L;

		mapInstance = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView([lat, lng], zoom);

		L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		// Add job site center marker (subtle)
		L.circleMarker([lat, lng], {
			radius: 6,
			fillColor: '#3b82f6',
			color: '#fff',
			weight: 2,
			opacity: 1,
			fillOpacity: 0.6
		})
			.addTo(mapInstance)
			.bindPopup('Job Site Center');

		// Add photo markers
		for (const photo of photosWithGPS) {
			if (photo.lat == null || photo.lng == null) continue;

			// Custom camera icon
			const iconHtml = `
				<div style="
					width: 32px;
					height: 32px;
					background: #f59e0b;
					border: 2px solid white;
					border-radius: 50%;
					display: flex;
					align-items: center;
					justify-content: center;
					box-shadow: 0 2px 4px rgba(0,0,0,0.3);
					font-size: 16px;
				">
					📷
				</div>
			`;

			const icon = L.divIcon({
				html: iconHtml,
				iconSize: [32, 32],
				iconAnchor: [16, 16],
				popupAnchor: [0, -16],
				className: 'photo-marker-icon'
			});

			const marker = L.marker([photo.lat, photo.lng], { icon }).addTo(mapInstance);

			// Popup with thumbnail
			const takenDate = new Date(photo.taken_at * 1000).toLocaleString();
			const popupContent = `
				<div style="text-align: center; min-width: 140px;">
					<img
						src="/api/job-sites/${jobSiteId}/photos/${photo.id}/view"
						alt="${photo.caption || photo.filename}"
						style="width: 120px; height: 120px; object-fit: cover; border-radius: 4px; margin-bottom: 8px;"
					/>
					${photo.caption ? `<div style="font-weight: 500; margin-bottom: 4px; font-size: 0.875rem;">${photo.caption}</div>` : ''}
					<div style="font-size: 0.75rem; color: #888;">${takenDate}</div>
				</div>
			`;

			marker.bindPopup(popupContent);
			markers.push(marker);
		}

		// Fit bounds to show all photos
		if (markers.length > 0) {
			const group = L.featureGroup(markers);
			mapInstance.fitBounds(group.getBounds().pad(0.1));
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
	});
</script>

<div class="photo-geo-map" style="--map-height: {height};">
	{#if loading}
		<div class="map-placeholder loading">
			<svg
				class="spin"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M21 12a9 9 0 11-6.219-8.56" />
			</svg>
			<span>Loading photos...</span>
		</div>
	{:else if error}
		<div class="map-placeholder error">
			<span>{error}</span>
		</div>
	{:else if photosWithGPS.length === 0}
		<div class="map-placeholder empty">
			<span>No geo-tagged photos yet</span>
		</div>
	{:else}
		<div bind:this={mapEl} class="map-container"></div>
	{/if}
</div>

<style>
	.photo-geo-map {
		width: 100%;
		height: var(--map-height);
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-container {
		width: 100%;
		height: 100%;
	}

	.map-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.map-placeholder.error {
		color: #f59e0b;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.spin {
		animation: spin 1s linear infinite;
	}

	:global(.photo-marker-icon) {
		background: transparent !important;
		border: none !important;
	}
</style>

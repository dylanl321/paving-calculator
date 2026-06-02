<script lang="ts">
	import { onMount } from 'svelte';
	import { MapContainer, MapMarker, MapCircleMarker } from '$lib/components/map';

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

	let photos = $state<Photo[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	const photosWithGPS = $derived(photos.filter((p) => p.lat != null && p.lng != null));

	const bounds = $derived.by<[[number, number], [number, number]] | undefined>(() => {
		if (photosWithGPS.length === 0) return undefined;
		const lats = photosWithGPS.map((p) => p.lat as number);
		const lngs = photosWithGPS.map((p) => p.lng as number);
		const minLat = Math.min(...lats);
		const maxLat = Math.max(...lats);
		const minLng = Math.min(...lngs);
		const maxLng = Math.max(...lngs);
		// Pad ~10% like the original featureGroup.getBounds().pad(0.1)
		const latPad = (maxLat - minLat) * 0.1 || 0.001;
		const lngPad = (maxLng - minLng) * 0.1 || 0.001;
		return [
			[minLat - latPad, minLng - lngPad],
			[maxLat + latPad, maxLng + lngPad]
		];
	});

	const cameraIconHtml = `
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

	function photoPopup(photo: Photo): string {
		const takenDate = new Date(photo.taken_at * 1000).toLocaleString();
		return `
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
	}

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
		<MapContainer class="photo-geo-container" {height} center={[lat, lng]} {zoom} bounds={bounds}>
			<MapCircleMarker
				{lat}
				{lng}
				radius={6}
				color="#fff"
				fillColor="#3b82f6"
				fillOpacity={0.6}
				weight={2}
				popupHtml="Job Site Center"
			/>
			{#each photosWithGPS as photo (photo.id)}
				<MapMarker
					lat={photo.lat as number}
					lng={photo.lng as number}
					iconHtml={cameraIconHtml}
					iconSize={[32, 32]}
					iconAnchor={[16, 16]}
					popupAnchor={[0, -16]}
					popupHtml={photoPopup(photo)}
					popupMinWidth={140}
				/>
			{/each}
		</MapContainer>
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

	.photo-geo-map :global(.photo-geo-container) {
		height: 100%;
		border-radius: 0;
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
</style>

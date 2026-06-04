<script lang="ts">
	import { browser } from '$app/environment';
	import MapView from '$lib/components/map-v2/MapView.svelte';
	import MapMarker from '$lib/components/map-v2/MapMarker.svelte';
	import MapPolyline from '$lib/components/map-v2/MapPolyline.svelte';

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

	// Bounds [[swLat,swLng],[neLat,neLng]] covering both markers.
	const routeBounds = $derived.by<[[number, number], [number, number]] | null>(() => {
		if (!canShowRoute) return null;
		const lats = [plant.latitude as number, site.latitude as number];
		const lngs = [plant.longitude as number, site.longitude as number];
		return [
			[Math.min(...lats), Math.min(...lngs)],
			[Math.max(...lats), Math.max(...lngs)]
		];
	});

	const routeCoords = $derived.by<[number, number][]>(() => {
		if (!canShowRoute) return [];
		return [
			[plant.latitude as number, plant.longitude as number],
			[site.latitude as number, site.longitude as number]
		];
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
		{#if browser && routeBounds}
			<MapView bounds={routeBounds} height="100%">
				{#snippet layers()}
					<MapPolyline id="haul-route" coordinates={routeCoords} color="#f59e0b" width={3} opacity={0.75} />
					<MapMarker
						lat={plant.latitude as number}
						lng={plant.longitude as number}
						color="#3b82f6"
						popupHtml={`<div style="font-size:0.85rem;line-height:1.5"><strong>${plant.name}</strong><br>Asphalt Plant</div>`}
					/>
					<MapMarker
						lat={site.latitude as number}
						lng={site.longitude as number}
						color="#f2c037"
						popupHtml={`<div style="font-size:0.85rem;line-height:1.5"><strong>${site.name}</strong><br>Job Site</div>`}
					/>
				{/snippet}
			</MapView>
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

<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { authStore } from '$lib/stores/auth.svelte';
	import { MapView } from '$lib/components/map-v2';
	import CrewLocationOverlay from '$lib/components/CrewLocationOverlay.svelte';

	const ALABAMA_CENTER: [number, number] = [32.806671, -86.79113];
	const DEFAULT_ZOOM = 7;
	const JOB_SITE_ZOOM = 15;

	let trackMyLocation = $state(false);
	let jobSiteName = $state<string | null>(null);
	let jobSiteCoords = $state<{ lat: number; lng: number } | null>(null);

	const jobSiteId = $derived.by(() => {
		const param = $page.url.searchParams.get('job_site_id');
		return param ? parseInt(param, 10) : undefined;
	});

	const mapCenter = $derived<[number, number]>(
		jobSiteCoords
			? [jobSiteCoords.lat, jobSiteCoords.lng]
			: ALABAMA_CENTER
	);
	const mapZoom = $derived(jobSiteCoords ? JOB_SITE_ZOOM : DEFAULT_ZOOM);

	// Fetch job site info if job_site_id is provided
	$effect(() => {
		if (!browser || !jobSiteId || !authStore.org?.id) return;

		fetch(`/api/job-sites/${jobSiteId}`)
			.then((res) => {
				if (!res.ok) throw new Error('Failed to fetch job site');
				return res.json() as Promise<{
					name?: string;
					latitude?: number | null;
					longitude?: number | null;
				}>;
			})
			.then((data) => {
				jobSiteName = data.name || null;
				if (data.latitude != null && data.longitude != null) {
					jobSiteCoords = { lat: data.latitude, lng: data.longitude };
				}
			})
			.catch((error) => {
				console.error('Error fetching job site:', error);
			});
	});

	// Redirect to login if not authenticated
	$effect(() => {
		if (!authStore.loading && !authStore.isAuthenticated) {
			goto('/login?redirect=/app/crew-map');
		}
	});

	function toggleLocationSharing() {
		trackMyLocation = !trackMyLocation;
	}
</script>

<div class="crew-map-page">
	<!-- Header -->
	<header class="map-header">
		<h1>Crew Map</h1>
		{#if jobSiteName}
			<div class="job-site-name">{jobSiteName}</div>
		{/if}
	</header>

	<!-- Map -->
	<div class="map-container">
		{#if authStore.user && authStore.org}
			<MapView
				center={mapCenter}
				zoom={mapZoom}
				height="100%"
			>
				{#snippet layers()}
					<CrewLocationOverlay
						orgId={authStore.org!.id}
						{jobSiteId}
						currentUserId={authStore.user!.id}
						currentUserName={authStore.user!.name}
						currentUserRole={authStore.org!.role}
						{trackMyLocation}
					/>
				{/snippet}
			</MapView>
		{:else if authStore.loading}
			<div class="loading">Loading...</div>
		{/if}
	</div>

	<!-- Control bar -->
	<div class="control-bar">
		<button
			class="location-toggle {trackMyLocation ? 'active' : ''}"
			onclick={toggleLocationSharing}
		>
			{#if trackMyLocation}
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<circle cx="12" cy="12" r="3" fill="currentColor"/>
					<path d="M12 2C12.5523 2 13 2.44772 13 3V5C13 5.55228 12.5523 6 12 6C11.4477 6 11 5.55228 11 5V3C11 2.44772 11.4477 2 12 2Z" fill="currentColor"/>
					<path d="M12 18C12.5523 18 13 18.4477 13 19V21C13 21.5523 12.5523 22 12 22C11.4477 22 11 21.5523 11 21V19C11 18.4477 11.4477 18 12 18Z" fill="currentColor"/>
					<path d="M22 12C22 12.5523 21.5523 13 21 13H19C18.4477 13 18 12.5523 18 12C18 11.4477 18.4477 11 19 11H21C21.5523 11 22 11.4477 22 12Z" fill="currentColor"/>
					<path d="M6 12C6 12.5523 5.55228 13 5 13H3C2.44772 13 2 12.5523 2 12C2 11.4477 2.44772 11 3 11H5C5.55228 11 6 11.4477 6 12Z" fill="currentColor"/>
				</svg>
				<span>Sharing location</span>
			{:else}
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M12 2C12.5523 2 13 2.44772 13 3V5C13 5.55228 12.5523 6 12 6C11.4477 6 11 5.55228 11 5V3C11 2.44772 11.4477 2 12 2Z" fill="currentColor"/>
					<path d="M12 18C12.5523 18 13 18.4477 13 19V21C13 21.5523 12.5523 22 12 22C11.4477 22 11 21.5523 11 21V19C11 18.4477 11.4477 18 12 18Z" fill="currentColor"/>
					<path d="M22 12C22 12.5523 21.5523 13 21 13H19C18.4477 13 18 12.5523 18 12C18 11.4477 18.4477 11 19 11H21C21.5523 11 22 11.4477 22 12Z" fill="currentColor"/>
					<path d="M6 12C6 12.5523 5.55228 13 5 13H3C2.44772 13 2 12.5523 2 12C2 11.4477 2.44772 11 3 11H5C5.55228 11 6 11.4477 6 12Z" fill="currentColor"/>
				</svg>
				<span>Share my location</span>
			{/if}
		</button>
	</div>
</div>

<style>
	.crew-map-page {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #0f172a;
	}

	.map-header {
		padding: 16px;
		background: #1e293b;
		border-bottom: 1px solid #334155;
	}

	.map-header h1 {
		margin: 0;
		font-size: 20px;
		font-weight: 600;
		color: #f2c037;
	}

	.job-site-name {
		margin-top: 4px;
		font-size: 14px;
		color: #94a3b8;
	}

	.map-container {
		flex: 1;
		position: relative;
		overflow: hidden;
	}

	.loading {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #94a3b8;
		font-size: 16px;
	}

	.control-bar {
		padding: 16px;
		background: #1e293b;
		border-top: 1px solid #334155;
		display: flex;
		justify-content: center;
	}

	.location-toggle {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 48px;
		padding: 12px 24px;
		background: #334155;
		border: none;
		border-radius: 8px;
		color: #cbd5e1;
		font-size: 16px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.location-toggle:hover {
		background: #475569;
	}

	.location-toggle.active {
		background: #22c55e;
		color: white;
	}

	.location-toggle svg {
		width: 24px;
		height: 24px;
	}
</style>

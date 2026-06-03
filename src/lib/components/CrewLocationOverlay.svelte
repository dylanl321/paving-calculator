<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import CrewLocationMarker from './map/CrewLocationMarker.svelte';
	import type { DbCrewLocation } from '$lib/server/db';

	interface Props {
		orgId: string;
		jobSiteId?: number;
		currentUserId: string;
		currentUserName: string;
		currentUserRole: string;
		trackMyLocation: boolean;
		pollIntervalMs?: number;
	}

	let {
		orgId,
		jobSiteId,
		currentUserId,
		currentUserName,
		currentUserRole,
		trackMyLocation,
		pollIntervalMs = 15000
	}: Props = $props();

	let locations = $state<DbCrewLocation[]>([]);
	let watchId: number | null = null;
	let pollTimerId: ReturnType<typeof setInterval> | null = null;
	let lastPosition: GeolocationPosition | null = null;

	const GEOLOCATION_OPTIONS: PositionOptions = {
		enableHighAccuracy: true,
		timeout: 10000,
		maximumAge: 5000
	};

	async function updateMyLocation(position: GeolocationPosition) {
		if (!browser || !trackMyLocation) return;

		const { latitude: lat, longitude: lng, accuracy, heading, speed } = position.coords;

		try {
			const body = {
				job_site_id: jobSiteId ?? null,
				lat,
				lng,
				accuracy: accuracy ?? null,
				heading: heading ?? null,
				speed: speed ?? null,
				status: 'active',
				display_name: currentUserName,
				role: currentUserRole
			};

			await fetch(`/api/org/${orgId}/crew-location`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			lastPosition = position;
		} catch (error) {
			console.error('Failed to update location:', error);
		}
	}

	async function fetchCrewLocations() {
		if (!browser) return;

		try {
			const params = new URLSearchParams();
			if (jobSiteId != null) params.set('job_site_id', String(jobSiteId));

			const response = await fetch(`/api/org/${orgId}/crew-locations?${params}`);
			if (!response.ok) throw new Error('Failed to fetch crew locations');

			const data = await response.json();
			locations = data.locations || [];
		} catch (error) {
			console.error('Failed to fetch crew locations:', error);
		}
	}

	async function removeMyLocation() {
		if (!browser) return;

		try {
			await fetch(`/api/org/${orgId}/crew-location`, {
				method: 'DELETE'
			});
		} catch (error) {
			console.error('Failed to remove location:', error);
		}
	}

	function startWatchingLocation() {
		if (!browser || !navigator.geolocation) return;

		watchId = navigator.geolocation.watchPosition(
			updateMyLocation,
			(error) => {
				console.error('Geolocation error:', error);
			},
			GEOLOCATION_OPTIONS
		);
	}

	function stopWatchingLocation() {
		if (watchId !== null && browser && navigator.geolocation) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
	}

	function startPolling() {
		fetchCrewLocations(); // Fetch immediately
		pollTimerId = setInterval(fetchCrewLocations, pollIntervalMs);
	}

	function stopPolling() {
		if (pollTimerId !== null) {
			clearInterval(pollTimerId);
			pollTimerId = null;
		}
	}

	// Watch trackMyLocation prop changes
	$effect(() => {
		if (trackMyLocation) {
			startWatchingLocation();
		} else {
			stopWatchingLocation();
			removeMyLocation();
		}
	});

	// Start polling on mount
	$effect(() => {
		startPolling();
		return () => {
			stopPolling();
		};
	});

	onDestroy(() => {
		stopWatchingLocation();
		stopPolling();
		removeMyLocation();
	});

	const onlineCount = $derived(locations.length);
</script>

<!-- Status badge -->
<div class="crew-status-badge">
	<div class="status-dot"></div>
	<span>{onlineCount} online</span>
</div>

<!-- Crew markers -->
{#each locations as location (location.id)}
	<CrewLocationMarker
		name={location.display_name}
		role={location.role}
		lat={location.lat}
		lng={location.lng}
		heading={location.heading ?? undefined}
		status={location.status}
		isMe={location.user_id === currentUserId}
		updatedAt={location.updated_at}
	/>
{/each}

<style>
	.crew-status-badge {
		position: absolute;
		top: 10px;
		right: 10px;
		z-index: 1000;
		background: rgba(15, 23, 42, 0.9);
		color: #f2c037;
		padding: 8px 16px;
		border-radius: 20px;
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 600;
		backdrop-filter: blur(4px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #22c55e;
		animation: pulse-dot 2s infinite;
	}

	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>

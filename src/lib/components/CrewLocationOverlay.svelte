<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { MapMarker } from '$lib/components/map-v2';
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

	const STATUS_COLORS: Record<string, string> = {
		active: '#22c55e',
		idle: '#f59e0b',
		offline: '#64748b'
	};

	function getInitials(name: string): string {
		const parts = name.trim().split(/\s+/);
		if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	}

	function formatRelativeTime(timestamp: number): string {
		const now = Math.floor(Date.now() / 1000);
		const diff = now - timestamp;
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		return `${Math.floor(diff / 86400)}d ago`;
	}

	function markerPopupHtml(loc: DbCrewLocation): string {
		return `<div style="padding:8px;text-align:center;min-width:130px">
			<div style="font-weight:600;font-size:14px;margin-bottom:4px;color:#1e293b">${loc.display_name}</div>
			<div style="font-size:12px;color:#64748b;margin-bottom:4px">${loc.role}</div>
			<div style="font-size:11px;color:#94a3b8">${formatRelativeTime(loc.updated_at)}</div>
		</div>`;
	}

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

			const data = (await response.json()) as { locations?: DbCrewLocation[] };
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

<!-- Status badge (rendered as an overlay on the map container) -->
<div class="crew-status-badge">
	<div class="status-dot"></div>
	<span>{onlineCount} online</span>
</div>

<!-- Crew markers (rendered inside MapView layers snippet) -->
{#each locations as location (location.id)}
	<MapMarker
		lat={location.lat}
		lng={location.lng}
		color={STATUS_COLORS[location.status] ?? STATUS_COLORS.active}
		label={getInitials(location.display_name)}
		popupHtml={markerPopupHtml(location)}
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
		pointer-events: none;
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

<script lang="ts">
	import { onDestroy } from 'svelte';
	import { checkArrival, DEFAULT_RADIUS_METERS, type GeofenceSite } from '$lib/services/geofence';

	interface Props {
		sites: Array<{
			id: string;
			name: string;
			latitude: number | null;
			longitude: number | null;
		}>;
	}

	let { sites }: Props = $props();

	const ANNOUNCEMENT_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes
	const BANNER_AUTO_DISMISS_MS = 8000; // 8 seconds

	let watchId: number | null = null;
	let currentSiteId: string | null = $state(null);
	let currentSiteName: string | null = $state(null);
	let isAcquiringLocation = $state(false);
	let hasPermission = $state(false);
	let nearbySiteCount = $state(0);
	let showBanner = $state(false);
	let bannerSiteName = $state('');
	let bannerSiteId = $state('');
	let bannerTimeoutId: ReturnType<typeof setTimeout> | null = null;

	const sitesWithCoordinates = $derived(
		sites
			.filter((s) => s.latitude != null && s.longitude != null)
			.map((s) => ({
				id: s.id,
				name: s.name,
				latitude: s.latitude as number,
				longitude: s.longitude as number
			}))
	);

	const shouldMonitor = $derived(
		sitesWithCoordinates.length > 0 && typeof navigator !== 'undefined' && 'geolocation' in navigator
	);

	function getAnnouncedSites(): Record<string, number> {
		try {
			const stored = sessionStorage.getItem('geofence_announced');
			return stored ? JSON.parse(stored) : {};
		} catch {
			return {};
		}
	}

	function setAnnouncedSite(siteId: string): void {
		try {
			const announced = getAnnouncedSites();
			announced[siteId] = Date.now();
			sessionStorage.setItem('geofence_announced', JSON.stringify(announced));
		} catch {
			// Ignore sessionStorage errors
		}
	}

	function shouldAnnounce(siteId: string): boolean {
		const announced = getAnnouncedSites();
		const lastTime = announced[siteId];
		if (!lastTime) return true;
		return Date.now() - lastTime > ANNOUNCEMENT_COOLDOWN_MS;
	}

	function showArrivalBanner(siteId: string, siteName: string): void {
		bannerSiteId = siteId;
		bannerSiteName = siteName;
		showBanner = true;

		if (bannerTimeoutId) {
			clearTimeout(bannerTimeoutId);
		}

		bannerTimeoutId = setTimeout(() => {
			showBanner = false;
		}, BANNER_AUTO_DISMISS_MS);
	}

	function dismissBanner(): void {
		showBanner = false;
		if (bannerTimeoutId) {
			clearTimeout(bannerTimeoutId);
			bannerTimeoutId = null;
		}
	}

	function handlePosition(position: GeolocationPosition): void {
		isAcquiringLocation = false;
		hasPermission = true;

		const { latitude, longitude } = position.coords;

		const result = checkArrival(latitude, longitude, sitesWithCoordinates, DEFAULT_RADIUS_METERS);

		if (result.arrived && result.site) {
			if (currentSiteId !== result.site.id) {
				currentSiteId = result.site.id;
				currentSiteName = result.site.name;

				if (shouldAnnounce(result.site.id)) {
					showArrivalBanner(result.site.id, result.site.name);
					setAnnouncedSite(result.site.id);
				}
			}
			nearbySiteCount = 0;
		} else {
			currentSiteId = null;
			currentSiteName = null;

			// Count nearby sites (within 2x radius)
			const nearbyThreshold = DEFAULT_RADIUS_METERS * 2;
			nearbySiteCount = sitesWithCoordinates.filter((site) => {
				const dist =
					Math.sqrt(
						Math.pow(latitude - site.latitude, 2) + Math.pow(longitude - site.longitude, 2)
					) * 111000; // rough conversion to meters
				return dist <= nearbyThreshold;
			}).length;
		}
	}

	function handleError(error: GeolocationPositionError): void {
		isAcquiringLocation = false;
		hasPermission = false;
		currentSiteId = null;
		currentSiteName = null;
		nearbySiteCount = 0;

		console.warn('Geolocation error:', error.message);
	}

	function startMonitoring(): void {
		if (!shouldMonitor) return;

		isAcquiringLocation = true;

		watchId = navigator.geolocation.watchPosition(handlePosition, handleError, {
			enableHighAccuracy: true,
			maximumAge: 30000,
			timeout: 10000
		});
	}

	function stopMonitoring(): void {
		if (watchId !== null) {
			navigator.geolocation.clearWatch(watchId);
			watchId = null;
		}
		isAcquiringLocation = false;
		hasPermission = false;
		currentSiteId = null;
		currentSiteName = null;
		nearbySiteCount = 0;
		showBanner = false;
		if (bannerTimeoutId) {
			clearTimeout(bannerTimeoutId);
			bannerTimeoutId = null;
		}
	}

	$effect(() => {
		if (shouldMonitor) {
			startMonitoring();
		}

		return () => {
			stopMonitoring();
		};
	});

	onDestroy(() => {
		stopMonitoring();
	});
</script>

{#if showBanner}
	<div class="arrival-banner">
		<div class="banner-content">
			<svg
				class="check-icon"
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
				<path d="M20 6L9 17l-5-5"></path>
			</svg>
			<span>Arrived at <strong>{bannerSiteName}</strong></span>
			<a href="/dashboard/job-sites/{bannerSiteId}" class="banner-link">Open site</a>
			<button class="banner-dismiss" onclick={dismissBanner} aria-label="Dismiss">
				<svg
					width="16"
					height="16"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18"></line>
					<line x1="6" y1="6" x2="18" y2="18"></line>
				</svg>
			</button>
		</div>
	</div>
{/if}

{#if shouldMonitor && (isAcquiringLocation || hasPermission)}
	<div class="status-bar">
		{#if isAcquiringLocation}
			<svg
				class="location-icon acquiring"
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="10"></circle>
				<circle cx="12" cy="12" r="3"></circle>
				<line x1="12" y1="1" x2="12" y2="3"></line>
				<line x1="12" y1="21" x2="12" y2="23"></line>
				<line x1="1" y1="12" x2="3" y2="12"></line>
				<line x1="21" y1="12" x2="23" y2="12"></line>
			</svg>
			<span class="status-text">Detecting location...</span>
		{:else if currentSiteId && currentSiteName}
			<span class="dot green"></span>
			<span class="status-text">{currentSiteName}</span>
		{:else if nearbySiteCount > 0}
			<span class="dot muted"></span>
			<span class="status-text muted">{nearbySiteCount} site{nearbySiteCount > 1 ? 's' : ''} nearby</span>
		{/if}

		<button class="stop-button" onclick={stopMonitoring}>Stop monitoring</button>
	</div>
{/if}

<style>
	.arrival-banner {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 1000;
		background: var(--accent);
		color: var(--accent-text);
		padding: 14px 16px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.banner-content {
		display: flex;
		align-items: center;
		gap: 10px;
		max-width: 1200px;
		margin: 0 auto;
		font-size: 0.9rem;
	}

	.check-icon {
		flex-shrink: 0;
	}

	.banner-content span {
		flex: 1;
	}

	.banner-link {
		color: var(--accent-text);
		text-decoration: underline;
		font-weight: 600;
		white-space: nowrap;
	}

	.banner-dismiss {
		background: none;
		border: none;
		color: var(--accent-text);
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.8;
		transition: opacity 0.2s;
		min-width: 48px;
		min-height: 48px;
	}

	.banner-dismiss:hover {
		opacity: 1;
	}

	.status-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		z-index: 999;
		background: var(--surface);
		border-top: 1px solid var(--border);
		padding: 8px 16px;
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 0.85rem;
		min-height: 48px;
		box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
	}

	.location-icon {
		flex-shrink: 0;
		color: var(--text-muted);
	}

	.location-icon.acquiring {
		animation: pulse 2s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.4;
		}
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.dot.green {
		background: var(--good);
	}

	.dot.muted {
		background: var(--text-muted);
		opacity: 0.4;
	}

	.status-text {
		flex: 1;
		color: var(--text);
	}

	.status-text.muted {
		color: var(--text-muted);
	}

	.stop-button {
		background: none;
		border: 1px solid var(--border);
		color: var(--text-muted);
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 0.8rem;
		cursor: pointer;
		white-space: nowrap;
		min-height: 48px;
		min-width: 48px;
		transition:
			background 0.2s,
			color 0.2s;
	}

	.stop-button:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	/* Tablet and up: adjust positioning for sidebar */
	@media (min-width: 768px) {
		.status-bar {
			left: var(--sidebar-rail-w);
		}
	}

	@media (min-width: 1100px) {
		.status-bar {
			left: var(--sidebar-w);
		}
	}
</style>

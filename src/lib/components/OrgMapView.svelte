<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import L from 'leaflet';

	// Leaflet's CSS references .png assets via url(); load it browser-only so it
	// stays out of the SSR / Pages Functions bundle (esbuild has no .png loader).
	if (browser) import('leaflet/dist/leaflet.css');

	interface MapSite {
		id: string;
		name: string;
		status: 'logging' | 'active' | 'paused' | 'completed' | 'archived';
		latitude: number;
		longitude: number;
		location_description: string | null;
		today_tons: number;
		today_loads: number;
		today_log_open: boolean;
		log_id: string | null;
		crew_name: string | null;
		crew_color: string | null;
	}

	interface Props {
		height?: string;
	}

	let { height = '100%' }: Props = $props();

	let mapEl: HTMLDivElement;
	let mapInstance: L.Map | null = null;
	let markerMap: Map<string, L.Marker> = new Map();
	let sites = $state<MapSite[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let lastUpdated = $state<Date | null>(null);
	let refreshInterval: number | undefined;

	const STATUS_COLORS: Record<string, string> = {
		logging: '#f2c037', // brand yellow - actively paving
		active: '#22c55e', // green
		paused: '#f59e0b', // amber
		completed: '#94a3b8', // slate
		archived: '#475569' // dark slate
	};

	const STATUS_LABELS: Record<string, string> = {
		logging: 'Logging',
		active: 'Active',
		paused: 'Paused',
		completed: 'Completed',
		archived: 'Archived'
	};

	const pinnedSites = $derived(sites.filter((s) => s.latitude != null && s.longitude != null));
	const statusCounts = $derived.by(() => {
		const counts: Record<string, number> = {};
		for (const site of pinnedSites) {
			counts[site.status] = (counts[site.status] || 0) + 1;
		}
		return counts;
	});

	const loggingCount = $derived(pinnedSites.filter((s) => s.status === 'logging').length);
	const activeCount = $derived(pinnedSites.filter((s) => s.status === 'active').length);

	function createPinIcon(color: string): L.DivIcon {
		return L.divIcon({
			html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
				<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="rgba(0,0,0,0.3)" stroke-width="1.5"/>
				<circle cx="14" cy="14" r="5" fill="rgba(255,255,255,0.9)"/>
			</svg>`,
			className: '',
			iconSize: [28, 36],
			iconAnchor: [14, 36],
			popupAnchor: [0, -40]
		});
	}

	function createPopupContent(site: MapSite): string {
		const color = STATUS_COLORS[site.status];
		const statusLabel = STATUS_LABELS[site.status];
		const isDark = document.documentElement.classList.contains('dark');
		const textColor = isDark ? '#e5e7eb' : '#1f2937';
		const mutedColor = isDark ? '#9ca3af' : '#6b7280';

		let content = `<div style="min-width:200px;font-family:system-ui,sans-serif;color:${textColor}">
			<strong style="font-size:0.95rem">${site.name}</strong><br>
			<span style="display:inline-block;margin:6px 0;padding:3px 10px;border-radius:999px;background:${color};color:#000;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>`;

		if (site.today_log_open && (site.today_tons > 0 || site.today_loads > 0)) {
			content += `<br><span style="font-size:0.85rem;color:${textColor};font-weight:600">${site.today_tons.toFixed(1)} T • ${site.today_loads} loads</span>`;
		}

		if (site.crew_name) {
			content += `<br><span style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-size:0.85rem;color:${textColor}">
				<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${site.crew_color}"></span>
				${site.crew_name}
			</span>`;
		}

		if (site.location_description) {
			content += `<br><span style="font-size:0.8rem;color:${mutedColor};margin-top:4px;display:block">${site.location_description}</span>`;
		}

		content += `<br><a href="/dashboard/job-sites/${site.id}" style="display:inline-block;margin-top:8px;font-size:0.82rem;color:#3b82f6;text-decoration:underline">Open site →</a>
		</div>`;

		return content;
	}

	function initMap() {
		if (!browser || !mapEl || pinnedSites.length === 0) return;

		// Destroy existing instance
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}

		const isDark = document.documentElement.classList.contains('dark');
		const tileLayer = isDark
			? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
			: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';

		mapInstance = L.map(mapEl, {
			zoomControl: true,
			attributionControl: true
		});

		L.tileLayer(tileLayer, {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		const bounds: [number, number][] = [];
		markerMap.clear();

		for (const site of pinnedSites) {
			bounds.push([site.latitude, site.longitude]);

			const color = STATUS_COLORS[site.status];
			const icon = createPinIcon(color);
			const popup = L.popup({ closeButton: true }).setContent(createPopupContent(site));

			const marker = L.marker([site.latitude, site.longitude], { icon })
				.bindPopup(popup)
				.addTo(mapInstance);

			markerMap.set(site.id, marker);
		}

		if (bounds.length === 1) {
			mapInstance.setView(bounds[0], 13);
		} else if (bounds.length > 1) {
			mapInstance.fitBounds(bounds, { padding: [50, 50] });
		}

		// Watch for theme changes
		const observer = new MutationObserver(() => {
			if (mapInstance) {
				initMap();
			}
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['class']
		});
	}

	async function fetchSites() {
		try {
			error = null;
			const res = await fetch('/api/org/map-sites', { credentials: 'include' });
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				throw new Error(data.error || 'Failed to fetch sites');
			}
			const data = (await res.json()) as { sites: MapSite[] };
			sites = data.sites;
			lastUpdated = new Date();
			loading = false;

			// Initialize or update map after data loads
			if (browser && pinnedSites.length > 0) {
				setTimeout(() => initMap(), 50);
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load map data';
			loading = false;
		}
	}

	function formatTime(date: Date): string {
		return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
	}

	onMount(() => {
		if (browser) {
			fetchSites();
			refreshInterval = setInterval(fetchSites, 30000) as unknown as number;
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	export function flyToSite(siteId: string) {
		const site = pinnedSites.find((s) => s.id === siteId);
		if (!site || !mapInstance) return;
		mapInstance.flyTo([site.latitude, site.longitude], 15, { duration: 1 });
		const marker = markerMap.get(siteId);
		if (marker) marker.openPopup();
	}
</script>

{#if loading}
	<div class="loading-state" style="height:{height}">
		<div class="spinner"></div>
		<p>Loading map...</p>
	</div>
{:else if error}
	<div class="error-state" style="height:{height}">
		<svg
			width="32"
			height="32"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
		>
			<circle cx="12" cy="12" r="10"></circle>
			<line x1="12" y1="8" x2="12" y2="12"></line>
			<line x1="12" y1="16" x2="12.01" y2="16"></line>
		</svg>
		<p class="error-message">{error}</p>
		<button class="btn-primary" onclick={fetchSites}>Retry</button>
	</div>
{:else if pinnedSites.length === 0}
	<div class="empty-state" style="height:{height}">
		<svg
			width="48"
			height="48"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
			<circle cx="12" cy="10" r="3"></circle>
		</svg>
		<p>No job sites have coordinates set. Edit job sites to add GPS locations.</p>
	</div>
{:else}
	<div class="map-container" style="height:{height}">
		<div bind:this={mapEl} class="map-element"></div>

		<!-- Top-left stats bar -->
		<div class="stats-overlay">
			<div class="stat-item">
				<span class="stat-label">Total Sites</span>
				<span class="stat-value">{pinnedSites.length}</span>
			</div>
			{#if loggingCount > 0}
				<div class="stat-item">
					<span class="status-dot logging"></span>
					<span class="stat-label">Logging</span>
					<span class="stat-value">{loggingCount}</span>
				</div>
			{/if}
			{#if activeCount > 0}
				<div class="stat-item">
					<span class="status-dot active"></span>
					<span class="stat-label">Active</span>
					<span class="stat-value">{activeCount}</span>
				</div>
			{/if}
		</div>

		<!-- Top-right legend -->
		<div class="legend-overlay">
			<h4 class="legend-title">Job Sites</h4>
			{#each Object.entries(STATUS_LABELS) as [status, label]}
				{#if statusCounts[status] > 0}
					<div class="legend-item">
						<span class="status-dot {status}"></span>
						<span class="legend-label">{label}</span>
					</div>
				{/if}
			{/each}
		</div>

		<!-- Bottom control bar -->
		<div class="control-bar">
			<button class="refresh-btn" onclick={fetchSites} aria-label="Refresh map">
				<svg
					width="18"
					height="18"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<polyline points="23 4 23 10 17 10"></polyline>
					<polyline points="1 20 1 14 7 14"></polyline>
					<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
				</svg>
				<span>Refresh</span>
			</button>
			{#if lastUpdated}
				<span class="update-time">Updated {formatTime(lastUpdated)}</span>
			{/if}
		</div>
	</div>
{/if}

<style>
	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
		padding: 40px 20px;
	}

	.loading-state .spinner {
		width: 40px;
		height: 40px;
		border: 3px solid var(--border);
		border-top-color: var(--primary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.error-state svg {
		color: #ef4444;
	}

	.error-message {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text);
	}

	.empty-state svg {
		opacity: 0.4;
	}

	.empty-state p {
		margin: 0;
		max-width: 320px;
	}

	.map-container {
		position: relative;
		width: 100%;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-element {
		width: 100%;
		height: 100%;
	}

	.stats-overlay {
		position: absolute;
		top: 16px;
		left: 16px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: rgba(46, 59, 70, 0.92);
		padding: 12px 16px;
		border-radius: 8px;
		backdrop-filter: blur(8px);
		z-index: 1000;
		min-width: 140px;
	}

	:global(.light) .stats-overlay {
		background: rgba(255, 255, 255, 0.95);
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text);
	}

	.stat-label {
		color: var(--text-muted);
		font-size: 0.8rem;
	}

	.stat-value {
		margin-left: auto;
		font-weight: 600;
		color: var(--text);
	}

	.legend-overlay {
		position: absolute;
		top: 16px;
		right: 16px;
		background: rgba(46, 59, 70, 0.92);
		padding: 12px 16px;
		border-radius: 8px;
		backdrop-filter: blur(8px);
		z-index: 1000;
		min-width: 140px;
	}

	:global(.light) .legend-overlay {
		background: rgba(255, 255, 255, 0.95);
	}

	.legend-title {
		margin: 0 0 10px 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
		font-size: 0.75rem;
	}

	.legend-item:last-child {
		margin-bottom: 0;
	}

	.legend-label {
		color: var(--text-muted);
	}

	.status-dot {
		display: inline-block;
		width: 10px;
		height: 10px;
		border-radius: 50%;
	}

	.status-dot.logging {
		background: #f2c037;
	}
	.status-dot.active {
		background: #22c55e;
	}
	.status-dot.paused {
		background: #f59e0b;
	}
	.status-dot.completed {
		background: #94a3b8;
	}
	.status-dot.archived {
		background: #475569;
	}

	.control-bar {
		position: absolute;
		bottom: 20px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 12px;
		background: rgba(46, 59, 70, 0.92);
		padding: 8px 16px;
		border-radius: 999px;
		backdrop-filter: blur(8px);
		z-index: 1000;
	}

	:global(.light) .control-bar {
		background: rgba(255, 255, 255, 0.95);
	}

	.refresh-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: transparent;
		border: none;
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		border-radius: 6px;
		min-height: 48px;
		transition: background 0.2s;
	}

	.refresh-btn:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	:global(.light) .refresh-btn:hover {
		background: rgba(0, 0, 0, 0.05);
	}

	.update-time {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 10px 20px;
		background: var(--primary);
		color: #000;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
		min-height: 48px;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	@media (max-width: 640px) {
		.stats-overlay,
		.legend-overlay {
			padding: 10px 12px;
			font-size: 0.75rem;
		}

		.legend-title {
			font-size: 0.8rem;
		}

		.control-bar {
			bottom: 16px;
		}

		.refresh-btn span {
			display: none;
		}
	}
</style>

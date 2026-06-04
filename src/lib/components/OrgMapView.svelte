<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import MapView from '$lib/components/map-v2/MapView.svelte';
	import MapMarker from '$lib/components/map-v2/MapMarker.svelte';
	import { coordinatesToBounds } from '$lib/services/mapUtils';
	import type { Map as MapLibreMap } from 'maplibre-gl';

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

	let map: MapLibreMap | null = $state(null);
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

	const mapBounds = $derived.by<[[number, number], [number, number]] | null>(() => {
		if (pinnedSites.length === 0) return null;
		return coordinatesToBounds(pinnedSites.map((s) => [s.latitude, s.longitude]));
	});

	function createPopupContent(site: MapSite): string {
		const color = STATUS_COLORS[site.status];
		const statusLabel = STATUS_LABELS[site.status];

		let content = `<div style="min-width:200px;font-family:system-ui,sans-serif;color:#1f2937">
			<strong style="font-size:0.95rem">${site.name}</strong><br>
			<span style="display:inline-block;margin:6px 0;padding:3px 10px;border-radius:999px;background:${color};color:#000;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>`;

		if (site.today_log_open && (site.today_tons > 0 || site.today_loads > 0)) {
			content += `<br><span style="font-size:0.85rem;font-weight:600">${site.today_tons.toFixed(1)} T • ${site.today_loads} loads</span>`;
		}

		if (site.crew_name) {
			content += `<br><span style="display:inline-flex;align-items:center;gap:6px;margin-top:4px;font-size:0.85rem">
				<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${site.crew_color}"></span>
				${site.crew_name}
			</span>`;
		}

		if (site.location_description) {
			content += `<br><span style="font-size:0.8rem;color:#6b7280;margin-top:4px;display:block">${site.location_description}</span>`;
		}

		content += `<br><a href="/dashboard/job-sites/${site.id}" style="display:inline-block;margin-top:8px;font-size:0.82rem;color:#3b82f6;text-decoration:underline">Open site →</a>
		</div>`;

		return content;
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
		if (refreshInterval) {
			clearInterval(refreshInterval);
		}
	});

	export function flyToSite(siteId: string) {
		const site = pinnedSites.find((s) => s.id === siteId);
		if (!site || !map) return;
		map.flyTo({ center: [site.longitude, site.latitude], zoom: 15, duration: 1000 });
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
		{#if browser && mapBounds}
			<MapView bind:map bounds={mapBounds} height="100%">
				{#snippet layers()}
					{#each pinnedSites as site (site.id)}
						<MapMarker
							lat={site.latitude}
							lng={site.longitude}
							color={STATUS_COLORS[site.status]}
							popupHtml={createPopupContent(site)}
						/>
					{/each}
				{/snippet}
			</MapView>
		{/if}

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

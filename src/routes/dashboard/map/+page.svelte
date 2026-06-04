<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { MapView, MapMarker } from '$lib/components/map-v2';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { PageData } from './$types';

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

	let { data }: { data: PageData } = $props();

	let mapInstance = $state<MapLibreMap | null>(null);
	let sites = $state<MapSite[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let sidebarOpen = $state(false);
	let activeFilter = $state<'all' | 'logging' | 'active' | 'paused' | 'completed'>('all');

	const STATUS_COLORS: Record<string, string> = {
		logging: '#f2c037',
		active: '#22c55e',
		paused: '#f59e0b',
		completed: '#94a3b8',
		archived: '#475569'
	};

	const STATUS_LABELS: Record<string, string> = {
		logging: 'Logging',
		active: 'Active',
		paused: 'Paused',
		completed: 'Completed',
		archived: 'Archived'
	};

	const pinnedSites = $derived(sites.filter((s) => s.latitude != null && s.longitude != null));

	const filteredSites = $derived.by(() => {
		if (activeFilter === 'all') return pinnedSites;
		return pinnedSites.filter((s) => s.status === activeFilter);
	});

	const sortedSites = $derived.by(() => {
		const statusOrder: Record<string, number> = {
			logging: 0,
			active: 1,
			paused: 2,
			completed: 3,
			archived: 4
		};
		return [...filteredSites].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
	});

	const statusCounts = $derived.by(() => {
		const counts: Record<string, number> = { all: pinnedSites.length };
		for (const site of pinnedSites) {
			counts[site.status] = (counts[site.status] || 0) + 1;
		}
		return counts;
	});

	// Default center — Georgia/Alabama region
	const mapCenter = $derived<[number, number]>(() => {
		if (pinnedSites.length === 1) {
			return [pinnedSites[0].latitude, pinnedSites[0].longitude];
		}
		return [33.749, -84.388];
	});

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
			loading = false;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load sites';
			loading = false;
		}
	}

	function handleSiteClick(siteId: string) {
		const site = pinnedSites.find((s) => s.id === siteId);
		if (site && mapInstance) {
			mapInstance.flyTo({ center: [site.longitude, site.latitude], zoom: 16 });
		}
		// Close mobile drawer after selection
		if (window.innerWidth < 768) {
			sidebarOpen = false;
		}
	}

	function toggleSidebar() {
		sidebarOpen = !sidebarOpen;
	}

	function popupHtml(site: MapSite): string {
		const statusLabel = STATUS_LABELS[site.status] || site.status;
		const color = STATUS_COLORS[site.status] || '#94a3b8';
		return `<div style="min-width:160px;font-family:system-ui,sans-serif">
			<strong style="font-size:0.95rem">${site.name}</strong><br>
			<span style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:999px;background:${color};color:${site.status === 'archived' ? '#fff' : '#000'};font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>
			${site.today_log_open && site.today_tons > 0 ? `<br><span style="font-size:0.85rem;font-weight:600">${site.today_tons.toFixed(1)} T &bull; ${site.today_loads} loads</span>` : ''}
			${site.crew_name ? `<br><span style="font-size:0.8rem;color:#94a3b8">${site.crew_name}</span>` : ''}
			${site.location_description ? `<br><span style="font-size:0.8rem;color:#666">${site.location_description}</span>` : ''}
			<br><a href="/dashboard/job-sites/${site.id}" style="display:inline-block;margin-top:8px;font-size:0.82rem;color:#3b82f6;text-decoration:underline">Open site &rarr;</a>
		</div>`;
	}

	onMount(() => {
		if (browser) {
			fetchSites();
			setInterval(fetchSites, 30000);
		}
	});
</script>

<svelte:head>
	<title>Map Dashboard — PaveRate</title>
</svelte:head>

<div class="map-page">
	<!-- Sidebar toggle button -->
	<button
		class="sidebar-toggle"
		class:open={sidebarOpen}
		onclick={toggleSidebar}
		aria-label="Toggle site list"
	>
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<line x1="3" y1="6" x2="21" y2="6"></line>
			<line x1="3" y1="12" x2="21" y2="12"></line>
			<line x1="3" y1="18" x2="21" y2="18"></line>
		</svg>
	</button>

	<!-- Sidebar -->
	<aside class="sidebar" class:open={sidebarOpen}>
		<div class="sidebar-header">
			<h2>Job Sites</h2>
			<a href="/dashboard" class="back-link">
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
					<line x1="19" y1="12" x2="5" y2="12"></line>
					<polyline points="12 19 5 12 12 5"></polyline>
				</svg>
				Dashboard
			</a>
		</div>

		<!-- Filter chips -->
		<div class="filter-chips">
			<button
				class="filter-chip"
				class:active={activeFilter === 'all'}
				onclick={() => (activeFilter = 'all')}
			>
				All ({statusCounts.all || 0})
			</button>
			{#if statusCounts.logging > 0}
				<button
					class="filter-chip"
					class:active={activeFilter === 'logging'}
					onclick={() => (activeFilter = 'logging')}
				>
					<span class="chip-dot logging"></span>
					Logging ({statusCounts.logging})
				</button>
			{/if}
			{#if statusCounts.active > 0}
				<button
					class="filter-chip"
					class:active={activeFilter === 'active'}
					onclick={() => (activeFilter = 'active')}
				>
					<span class="chip-dot active"></span>
					Active ({statusCounts.active})
				</button>
			{/if}
			{#if statusCounts.paused > 0}
				<button
					class="filter-chip"
					class:active={activeFilter === 'paused'}
					onclick={() => (activeFilter = 'paused')}
				>
					<span class="chip-dot paused"></span>
					Paused ({statusCounts.paused})
				</button>
			{/if}
			{#if statusCounts.completed > 0}
				<button
					class="filter-chip"
					class:active={activeFilter === 'completed'}
					onclick={() => (activeFilter = 'completed')}
				>
					<span class="chip-dot completed"></span>
					Completed ({statusCounts.completed})
				</button>
			{/if}
		</div>

		<!-- Sites list -->
		<div class="sites-list">
			{#if loading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>Loading sites...</p>
				</div>
			{:else if error}
				<div class="error-state">
					<p>{error}</p>
				</div>
			{:else if sortedSites.length === 0}
				<div class="empty-state">
					<p>No sites match the current filter.</p>
				</div>
			{:else}
				{#each sortedSites as site (site.id)}
					<div class="site-card">
						<button class="site-card-button" onclick={() => handleSiteClick(site.id)}>
							<div class="site-card-header">
								<h3 class="site-name">{site.name}</h3>
								<span class="status-badge {site.status}">{STATUS_LABELS[site.status]}</span>
							</div>
							{#if site.status === 'logging' && site.today_log_open && site.today_tons > 0}
								<p class="site-metric">{site.today_tons.toFixed(1)} T • {site.today_loads} loads</p>
							{/if}
							{#if site.crew_name}
								<div class="crew-info">
									<span class="crew-dot" style="background:{site.crew_color}"></span>
									<span class="crew-name">{site.crew_name}</span>
								</div>
							{/if}
						</button>
						<a href="/dashboard/job-sites/{site.id}" class="site-link">
							Open site →
						</a>
					</div>
				{/each}
			{/if}
		</div>
	</aside>

	<!-- Map container -->
	<div class="map-container">
		<MapView
			center={mapCenter()}
			zoom={pinnedSites.length === 1 ? 15 : 9}
			height="100%"
			bind:map={mapInstance}
		>
			{#snippet layers()}
				{#each pinnedSites as site (site.id)}
					<MapMarker
						lat={site.latitude}
						lng={site.longitude}
						color={STATUS_COLORS[site.status]}
						label={site.name.charAt(0)}
						popupHtml={popupHtml(site)}
					/>
				{/each}
			{/snippet}
		</MapView>
	</div>

	<!-- Mobile overlay -->
	{#if sidebarOpen}
		<button class="overlay" onclick={toggleSidebar}></button>
	{/if}
</div>

<style>
	.map-page {
		position: relative;
		width: 100%;
		height: 100vh;
		display: flex;
		background: var(--background);
		overflow: hidden;
	}

	.sidebar-toggle {
		position: fixed;
		top: 16px;
		left: 16px;
		z-index: 2000;
		width: 48px;
		height: 48px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	.sidebar-toggle:hover {
		background: var(--surface-hover);
	}

	.sidebar {
		position: fixed;
		left: 0;
		top: 0;
		height: 100vh;
		width: 320px;
		background: var(--surface);
		border-right: 1px solid var(--border);
		z-index: 1500;
		display: flex;
		flex-direction: column;
		transition: transform 0.3s ease;
	}

	.sidebar-header {
		padding: 20px;
		border-bottom: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.sidebar-header h2 {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9rem;
		transition: color 0.2s;
	}

	.back-link:hover {
		color: var(--text);
	}

	.filter-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}

	.filter-chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 14px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		min-height: 36px;
	}

	.filter-chip:hover {
		background: var(--surface-hover);
	}

	.filter-chip.active {
		background: var(--primary);
		color: #000;
		border-color: var(--primary);
	}

	.chip-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.chip-dot.logging {
		background: #f2c037;
	}
	.chip-dot.active {
		background: #22c55e;
	}
	.chip-dot.paused {
		background: #f59e0b;
	}
	.chip-dot.completed {
		background: #94a3b8;
	}

	.sites-list {
		flex: 1;
		overflow-y: auto;
		padding: 16px;
	}

	.loading-state,
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 40px 20px;
		text-align: center;
		color: var(--text-muted);
	}

	.spinner {
		width: 32px;
		height: 32px;
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

	.site-card {
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 14px;
		margin-bottom: 12px;
		transition: border-color 0.2s;
	}

	.site-card:hover {
		border-color: var(--primary);
	}

	.site-card-button {
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		margin-bottom: 10px;
	}

	.site-card-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
		margin-bottom: 8px;
	}

	.site-name {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		flex: 1;
	}

	.status-badge {
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		flex-shrink: 0;
	}

	.status-badge.logging {
		background: #f2c037;
		color: #000;
	}
	.status-badge.active {
		background: #22c55e;
		color: #000;
	}
	.status-badge.paused {
		background: #f59e0b;
		color: #000;
	}
	.status-badge.completed {
		background: #94a3b8;
		color: #000;
	}
	.status-badge.archived {
		background: #475569;
		color: #fff;
	}

	.site-metric {
		margin: 0 0 6px 0;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
	}

	.crew-info {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.crew-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.crew-name {
		font-weight: 500;
	}

	.site-link {
		display: inline-block;
		font-size: 0.85rem;
		color: #3b82f6;
		text-decoration: none;
		transition: color 0.2s;
	}

	.site-link:hover {
		color: #2563eb;
		text-decoration: underline;
	}

	.map-container {
		flex: 1;
		margin-left: 320px;
		width: calc(100% - 320px);
	}

	.overlay {
		display: none;
	}

	/* Mobile styles */
	@media (max-width: 767px) {
		.sidebar {
			transform: translateY(100%);
			left: 0;
			top: auto;
			bottom: 0;
			width: 100%;
			height: 75vh;
			border-right: none;
			border-top: 1px solid var(--border);
			border-radius: 16px 16px 0 0;
		}

		.sidebar.open {
			transform: translateY(0);
		}

		.map-container {
			margin-left: 0;
			width: 100%;
		}

		.overlay {
			display: block;
			position: fixed;
			inset: 0;
			background: rgba(0, 0, 0, 0.5);
			z-index: 1400;
			cursor: pointer;
			border: none;
		}
	}

	/* Desktop: sidebar always visible */
	@media (min-width: 768px) {
		.sidebar-toggle {
			display: none;
		}

		.sidebar {
			transform: none;
		}
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { MapView, ProjectMapWorkspace } from '$lib/components/map-v2';
	import type { WorkspaceMode } from '$lib/components/map-v2/ProjectMapWorkspace.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { getUxRole, type UxRole } from '$lib/uxRole';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import type { RoadwayLogEventMarker } from '$lib/components/map-v2/RoadwayLogLayer.svelte';
	import JobMapLayer from './JobMapLayer.svelte';

	interface RouteWaypoint {
		lat: number;
		lng: number;
	}
	interface RoadSection {
		id: string;
		name: string;
		status: string;
		geometry: object | null;
		segment_group: string | null;
		treatment: string | null;
	}
	interface MapJobSite {
		id: string;
		name: string;
		status: string;
		latitude: number | null;
		longitude: number | null;
		location_description: string | null;
		gdot_county: string | null;
		route_designation: string | null;
		crew_name: string | null;
		crew_color: string | null;
		waypoints: RouteWaypoint[];
		sections: RoadSection[];
		roadway_log_events: RoadwayLogEventMarker[];
		has_geometry: boolean;
	}

	let mapInstance = $state<MapLibreMap | null>(null);
	let sites = $state<MapJobSite[]>([]);
	let loading = $state(true);
	let loadError = $state<string | null>(null);
	let panelOpen = $state(true);
	let search = $state('');
	let isFullscreen = $state(false);
	// True when the page was opened via a ?job= deep link (focus that job, not
	// the role-default overview).
	let hadJobDeepLink = $state(false);

	// Which job is focused (yellow + roadway-log + fit bounds).
	let focusedId = $state<string | null>(null);
	// Extra jobs the user has switched on as overlays.
	let overlayIds = $state<Set<string>>(new Set());

	// ── role-aware default intent ───────────────────────────────────────────────
	// The map opens on a role-appropriate default (without removing any of the
	// user's controls): Foreman -> today's/assigned active routes, Admin/Office ->
	// jobs missing geometry/setup, Owner -> portfolio status overview, Field Crew ->
	// assigned work only. The default is applied ONCE after the first load; the
	// existing search, show-all/only-selected, and ?job=/?mode= deep links all
	// continue to work and override it.
	const uxRole = $derived<UxRole>(getUxRole(authStore.org?.role ?? ''));
	let roleDefaultApplied = $state(false);
	let roleBannerDismissed = $state(false);

	/** Jobs a foreman/field crew would consider "today's / assigned" work. */
	function isAssignedActive(site: MapJobSite): boolean {
		return site.status === 'active' && site.crew_name != null;
	}
	/** Jobs an Admin/Office user needs to fix: pinned but no route/section geometry. */
	function needsGeometrySetup(site: MapJobSite): boolean {
		return !site.has_geometry;
	}

	const roleBannerText = $derived.by<string | null>(() => {
		switch (uxRole) {
			case 'foreman':
				return "Showing today's routes — active jobs assigned to a crew.";
			case 'admin_office':
				return 'Showing jobs missing geometry or setup.';
			case 'owner':
				return 'Portfolio status — all jobs across the org.';
			case 'field_crew':
				return 'Showing your assigned routes.';
			default:
				return null;
		}
	});

	// ── editing on the full-screen surface ──────────────────────────────────────
	// The full-screen page reuses the SAME 4a controllers (via ProjectMapWorkspace)
	// so it gains the editing the project workspace has. A ?mode= deep link opens
	// the focused job straight into that edit mode.
	type EditMode = WorkspaceMode;
	let editMode = $state<EditMode>('view');
	interface EditData {
		jobId: string;
		waypoints: { lat: number; lng: number }[];
		numLanes: number | null;
		laneWidthFt: number | null;
		totalLengthFt: number | null;
		beginStation: number | null;
		endStation: number | null;
		beginLabel: string | null;
		endLabel: string | null;
	}
	let editData = $state<EditData | null>(null);
	let editLoading = $state(false);
	// A ?mode= deep link captured at load, applied once a focus is resolved
	// (either by ?job= or by the role-aware default).
	let pendingMode = $state<EditMode>('view');

	function parseMode(value: string | null): EditMode {
		return value === 'route' || value === 'sections' || value === 'termini' ? value : 'view';
	}

	/** Load the focused job's config + fresh route so the workspace can edit it. */
	async function loadEditData(jobId: string): Promise<EditData | null> {
		editLoading = true;
		try {
			const [routeRes, configRes] = await Promise.all([
				fetch(`/api/job-sites/${jobId}/route`, { credentials: 'include' }),
				fetch(`/api/job-sites/${jobId}/config`, { credentials: 'include' })
			]);
			const routeBody = (routeRes.ok ? await routeRes.json() : { waypoints: [] }) as {
				waypoints?: { lat: number; lng: number }[];
			};
			const configBody = (configRes.ok ? await configRes.json() : { config: null }) as {
				config: {
					num_lanes: number | null;
					lane_width_ft: number | null;
					total_length_ft: number | null;
					begin_station: number | null;
					end_station: number | null;
					begin_terminus: string | null;
					end_terminus: string | null;
				} | null;
			};
			const cfg = configBody.config;
			return {
				jobId,
				waypoints: routeBody.waypoints ?? [],
				numLanes: cfg?.num_lanes ?? null,
				laneWidthFt: cfg?.lane_width_ft ?? null,
				totalLengthFt: cfg?.total_length_ft ?? null,
				beginStation: cfg?.begin_station ?? null,
				endStation: cfg?.end_station ?? null,
				beginLabel: cfg?.begin_terminus ?? null,
				endLabel: cfg?.end_terminus ?? null
			};
		} catch {
			toastStore.error('Failed to load job for editing');
			return null;
		} finally {
			editLoading = false;
		}
	}

	/** Apply a captured ?mode= deep link to the currently focused job, once. */
	async function applyPendingMode() {
		if (pendingMode === 'view' || !focusedId) return;
		const mode = pendingMode;
		pendingMode = 'view';
		editMode = mode;
		editData = await loadEditData(focusedId);
	}

	/** Switch edit mode for the focused job, syncing the ?mode= URL param. */
	async function setEditMode(next: EditMode) {
		editMode = next;
		const url = new URL($page.url);
		if (next === 'view') url.searchParams.delete('mode');
		else url.searchParams.set('mode', next);
		void goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true });
		if (next !== 'view' && focusedId && editData?.jobId !== focusedId) {
			editData = await loadEditData(focusedId);
		}
	}

	async function persistRoute(waypoints: { lat: number; lng: number }[]) {
		if (!focusedId) return;
		const res = await fetch(`/api/job-sites/${focusedId}/route`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ waypoints }),
			credentials: 'include'
		});
		if (res.ok) {
			toastStore.success('Route saved');
			await fetchSites();
			if (focusedId) editData = await loadEditData(focusedId);
		} else {
			toastStore.error('Failed to save route');
		}
	}

	async function persistTerminus(field: 'begin' | 'end', station: number) {
		if (!focusedId) return;
		const patch = field === 'begin' ? { begin_station: station } : { end_station: station };
		const res = await fetch(`/api/job-sites/${focusedId}/config`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(patch),
			credentials: 'include'
		});
		if (res.ok) toastStore.success(`${field === 'begin' ? 'Begin' : 'End'} terminus saved`);
		else toastStore.error('Failed to save terminus');
	}

	const ACCENT = '#f2c037';

	const focusedSite = $derived(sites.find((s) => s.id === focusedId) ?? null);

	const visibleSites = $derived.by(() => {
		const out: MapJobSite[] = [];
		for (const s of sites) {
			if (s.id === focusedId || overlayIds.has(s.id)) out.push(s);
		}
		return out;
	});

	const filteredSites = $derived.by(() => {
		const q = search.trim().toLowerCase();
		const list = q
			? sites.filter(
					(s) =>
						s.name.toLowerCase().includes(q) ||
						(s.route_designation ?? '').toLowerCase().includes(q) ||
						(s.location_description ?? '').toLowerCase().includes(q)
				)
			: sites;
		return [...list].sort((a, b) => a.name.localeCompare(b.name));
	});

	const pinnedCount = $derived(sites.filter((s) => s.latitude != null && s.longitude != null).length);
	const geometryCount = $derived(sites.filter((s) => s.has_geometry).length);

	// Sites that match the current role's default intent. Drives the initial
	// overlay set, the initial fit, and the "needs setup" list emphasis.
	const roleRelevantSites = $derived.by<MapJobSite[]>(() => {
		switch (uxRole) {
			case 'foreman':
			case 'field_crew':
				return sites.filter(isAssignedActive);
			case 'admin_office':
				return sites.filter(needsGeometrySetup);
			case 'owner':
			default:
				return sites;
		}
	});

	// Admin/Office gets a "needs geometry/setup" emphasis in the list.
	const emphasizeSetupGaps = $derived(uxRole === 'admin_office');

	// ── geometry bounds for fit-to ───────────────────────────────────────────
	function siteLatLngs(site: MapJobSite): [number, number][] {
		const out: [number, number][] = [];
		for (const w of site.waypoints) out.push([w.lat, w.lng]);
		for (const sec of site.sections) {
			const geo = sec.geometry as { type?: string; coordinates?: unknown } | null;
			if (!geo) continue;
			const pushLine = (coords: unknown) => {
				if (!Array.isArray(coords)) return;
				for (const c of coords) {
					if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
						out.push([c[1] as number, c[0] as number]);
					}
				}
			};
			if (geo.type === 'LineString') pushLine(geo.coordinates);
			else if (geo.type === 'MultiLineString' && Array.isArray(geo.coordinates)) {
				for (const part of geo.coordinates as unknown[]) pushLine(part);
			}
		}
		if (site.latitude != null && site.longitude != null) out.push([site.latitude, site.longitude]);
		return out;
	}

	function focusOnMap(site: MapJobSite) {
		if (!mapInstance) return;
		const pts = siteLatLngs(site);
		if (pts.length === 0) return;
		if (pts.length === 1) {
			mapInstance.flyTo({ center: [pts[0][1], pts[0][0]], zoom: 15 });
			return;
		}
		let minLat = Infinity,
			minLng = Infinity,
			maxLat = -Infinity,
			maxLng = -Infinity;
		for (const [lat, lng] of pts) {
			minLat = Math.min(minLat, lat);
			maxLat = Math.max(maxLat, lat);
			minLng = Math.min(minLng, lng);
			maxLng = Math.max(maxLng, lng);
		}
		mapInstance.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat]
			],
			{ padding: 80, maxZoom: 16, duration: 600 }
		);
	}

	/** Fit the map to the combined extent of several sites (role-default overview). */
	function fitToSites(list: MapJobSite[]) {
		if (!mapInstance) return;
		const pts: [number, number][] = [];
		for (const s of list) pts.push(...siteLatLngs(s));
		if (pts.length === 0) return;
		if (pts.length === 1) {
			mapInstance.flyTo({ center: [pts[0][1], pts[0][0]], zoom: 13 });
			return;
		}
		let minLat = Infinity,
			minLng = Infinity,
			maxLat = -Infinity,
			maxLng = -Infinity;
		for (const [lat, lng] of pts) {
			minLat = Math.min(minLat, lat);
			maxLat = Math.max(maxLat, lat);
			minLng = Math.min(minLng, lng);
			maxLng = Math.max(maxLng, lng);
		}
		mapInstance.fitBounds(
			[
				[minLng, minLat],
				[maxLng, maxLat]
			],
			{ padding: 80, maxZoom: 14, duration: 600 }
		);
	}

	function selectJob(id: string, opts: { fly?: boolean } = { fly: true }) {
		focusedId = id;
		// Reflect selection in the URL without a full reload.
		const url = new URL($page.url);
		url.searchParams.set('job', id);
		void goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true });
		const site = sites.find((s) => s.id === id);
		if (site && opts.fly !== false) focusOnMap(site);
		if (browser && window.innerWidth < 768) panelOpen = false;
		// Switching jobs while editing reloads that job's edit data; otherwise drop
		// back to view so we don't show stale geometry under an edit toolbar.
		if (editMode !== 'view') {
			void loadEditData(id).then((d) => (editData = d));
		}
	}

	function toggleOverlay(id: string) {
		if (id === focusedId) return; // focused job is always shown
		const next = new Set(overlayIds);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		overlayIds = next;
	}

	function showAll() {
		const next = new Set<string>();
		for (const s of sites) if (s.id !== focusedId) next.add(s.id);
		overlayIds = next;
	}

	function hideOthers() {
		overlayIds = new Set();
	}

	/**
	 * Apply the role-appropriate default focus + overlay set once, after sites
	 * have loaded and the auth store has resolved the user's role.
	 * - Owner: show all jobs as a portfolio status overview.
	 * - Foreman / Field Crew: show today's/assigned active routes.
	 * - Admin/Office: show jobs missing geometry/setup so they can fix them.
	 * A ?job= deep link overrides the default focus; the user can still change
	 * everything via search + show-all/only-selected afterward.
	 */
	function applyRoleDefault() {
		if (roleDefaultApplied) return;
		roleDefaultApplied = true;

		const relevant = uxRole === 'owner' ? sites : roleRelevantSites;
		const next = new Set<string>();
		for (const s of relevant) next.add(s.id);
		overlayIds = next;

		// Pick a sensible default focus when no deep link asked for one.
		if (!hadJobDeepLink) {
			const fallback =
				relevant.find((s) => s.has_geometry) ??
				relevant[0] ??
				sites.find((s) => s.has_geometry) ??
				sites.find((s) => s.latitude != null && s.longitude != null) ??
				sites[0] ??
				null;
			if (fallback) focusedId = fallback.id;
		}
	}

	async function fetchSites() {
		try {
			loadError = null;
			const res = await fetch('/api/job-sites/map', { credentials: 'include' });
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(body.error || 'Failed to load job sites');
			}
			const body = (await res.json()) as { job_sites: MapJobSite[] };
			sites = body.job_sites;

			// Resolve initial focus from a ?job= deep link only. The role-aware
			// default focus + overlays are applied reactively (see $effect below)
			// once the auth store has resolved the user's role.
			const requested = $page.url.searchParams.get('job');
			hadJobDeepLink = !!(requested && sites.some((s) => s.id === requested));
			if (hadJobDeepLink && requested) {
				focusedId = requested;
			}

			// Honor a ?mode= deep link: open the focused job straight into edit mode.
			// If a ?job= deep link set the focus we can apply it now; otherwise we
			// defer to applyPendingMode() once the role default resolves the focus.
			pendingMode = parseMode($page.url.searchParams.get('mode'));
			if (pendingMode !== 'view' && focusedId) {
				await applyPendingMode();
			}
		} catch (err) {
			loadError = err instanceof Error ? err.message : 'Failed to load job sites';
		} finally {
			loading = false;
		}
	}

	// Apply the role-aware default once the auth role is known and sites exist.
	$effect(() => {
		if (roleDefaultApplied) return;
		if (authStore.loading) return;
		if (sites.length === 0) return;
		applyRoleDefault();
		// A ?mode= deep link without ?job= now has a focus to open into.
		if (pendingMode !== 'view') void applyPendingMode();
	});

	// Fit the map once it and the data are both ready. With a ?job= deep link we
	// fit that single focused job; otherwise we fit the role-default overview
	// (foreman's routes, admin's setup-gap jobs, owner's whole portfolio).
	let didInitialFit = $state(false);
	$effect(() => {
		if (!mapInstance || didInitialFit) return;
		if (hadJobDeepLink) {
			if (!focusedSite) return;
			focusOnMap(focusedSite);
			didInitialFit = true;
			return;
		}
		// Wait for the role default to settle before fitting the overview.
		if (!roleDefaultApplied) return;
		const overview = (uxRole === 'owner' ? sites : roleRelevantSites).filter(
			(s) => siteLatLngs(s).length > 0
		);
		if (overview.length > 0) {
			fitToSites(overview);
			didInitialFit = true;
		} else if (focusedSite) {
			focusOnMap(focusedSite);
			didInitialFit = true;
		}
	});

	const initialCenter = $derived.by<[number, number]>(() => {
		if (focusedSite?.latitude != null && focusedSite?.longitude != null) {
			return [focusedSite.latitude, focusedSite.longitude];
		}
		return [33.749, -84.388];
	});

	function toggleFullscreen() {
		isFullscreen = !isFullscreen;
		// Let layout settle, then tell MapLibre to re-measure.
		if (browser) requestAnimationFrame(() => mapInstance?.resize());
	}

	onMount(() => {
		if (browser) void fetchSites();
	});
</script>

<svelte:head>
	<title>Map — PaveRate</title>
</svelte:head>

<div class="map-page" class:fullscreen={isFullscreen}>
	<aside class="panel" class:open={panelOpen}>
		<div class="panel-head">
			<div>
				<h2>Jobs Map</h2>
				<p class="panel-sub">
					{geometryCount} with routes · {pinnedCount} pinned · {sites.length} total
				</p>
			</div>
			<a href="/dashboard" class="back-link" aria-label="Back to dashboard">Dashboard</a>
		</div>

		<div class="panel-tools">
			<input
				class="search"
				type="search"
				placeholder="Search jobs…"
				bind:value={search}
				aria-label="Search jobs"
			/>
			<div class="overlay-actions">
				<button type="button" class="mini-btn" onclick={showAll}>Show all</button>
				<button type="button" class="mini-btn" onclick={hideOthers}>Only selected</button>
			</div>
		</div>

		{#if roleBannerText && !roleBannerDismissed && !loading}
			<div class="role-banner">
				<span class="role-banner-text">{roleBannerText}</span>
				<button
					type="button"
					class="role-banner-dismiss"
					onclick={() => (roleBannerDismissed = true)}
					aria-label="Dismiss"
				>
					×
				</button>
			</div>
		{/if}

		<div class="jobs-list">
			{#if loading}
				<div class="state"><span class="spinner"></span><p>Loading jobs…</p></div>
			{:else if loadError}
				<div class="state state-error"><p>{loadError}</p></div>
			{:else if uxRole === 'field_crew' && roleRelevantSites.length === 0 && search.trim() === ''}
				<div class="state">
					<p>No assigned route.</p>
					<p class="state-sub">You have no active jobs assigned to a crew right now.</p>
				</div>
			{:else if filteredSites.length === 0}
				<div class="state"><p>No jobs match “{search}”.</p></div>
			{:else}
				{#each filteredSites as site (site.id)}
					{@const isFocused = site.id === focusedId}
					{@const isOn = isFocused || overlayIds.has(site.id)}
					{@const needsSetup = emphasizeSetupGaps && needsGeometrySetup(site)}
					<div class="job-row" class:focused={isFocused} class:needs-setup={needsSetup}>
						<button
							type="button"
							class="job-main"
							onclick={() => selectJob(site.id)}
							aria-pressed={isFocused}
						>
							<span class="job-swatch" class:accent={isFocused} class:has-geo={site.has_geometry}></span>
							<span class="job-text">
								<span class="job-name">{site.name}</span>
								<span class="job-meta">
									{site.route_designation ?? site.location_description ?? site.status}
									{#if !site.has_geometry}<span class="no-geo"> · pin only</span>{/if}
								</span>
							</span>
							{#if needsSetup}<span class="setup-badge">Needs setup</span>{/if}
						</button>
						<label class="toggle" title="Show on map">
							<input
								type="checkbox"
								checked={isOn}
								disabled={isFocused}
								onchange={() => toggleOverlay(site.id)}
							/>
							<span class="toggle-box" aria-hidden="true"></span>
						</label>
						<a class="open-link" href="/dashboard/job-sites/{site.id}" aria-label="Open {site.name}">›</a>
					</div>
				{/each}
			{/if}
		</div>
	</aside>

	<div class="map-area">
		<div class="map-controls">
			<button
				type="button"
				class="ctl-btn"
				onclick={() => (panelOpen = !panelOpen)}
				aria-label={panelOpen ? 'Hide job list' : 'Show job list'}
			>
				{panelOpen ? '‹ List' : 'List ›'}
			</button>
			<button
				type="button"
				class="ctl-btn"
				onclick={toggleFullscreen}
				aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
			>
				{isFullscreen ? 'Exit' : 'Fullscreen'}
			</button>
		</div>

		{#if focusedSite}
			<div class="focus-banner">
				<span class="focus-dot"></span>
				<strong>{focusedSite.name}</strong>
				{#if focusedSite.route_designation}<span class="focus-route">{focusedSite.route_designation}</span>{/if}
				<a href="/dashboard/job-sites/{focusedSite.id}" class="focus-open">Open</a>
			</div>

			<div class="edit-switcher" role="tablist" aria-label="Edit mode">
				<button
					type="button"
					class="edit-btn"
					class:active={editMode === 'view'}
					onclick={() => setEditMode('view')}
				>
					View
				</button>
				<button
					type="button"
					class="edit-btn"
					class:active={editMode === 'route'}
					onclick={() => setEditMode('route')}
				>
					Route
				</button>
				<button
					type="button"
					class="edit-btn"
					class:active={editMode === 'sections'}
					onclick={() => setEditMode('sections')}
				>
					Sections
				</button>
				<button
					type="button"
					class="edit-btn"
					class:active={editMode === 'termini'}
					onclick={() => setEditMode('termini')}
				>
					Termini
				</button>
			</div>
		{/if}

		{#if browser}
			{#if editMode !== 'view' && focusedSite}
				<div class="edit-surface">
					{#if editLoading || !editData || editData.jobId !== focusedSite.id}
						<div class="edit-loading"><span class="spinner"></span><p>Loading {focusedSite.name}…</p></div>
					{:else}
						<ProjectMapWorkspace
							siteId={editData.jobId}
							waypoints={editData.waypoints}
							numLanes={editData.numLanes}
							laneWidthFt={editData.laneWidthFt}
							totalLengthFt={editData.totalLengthFt}
							beginStation={editData.beginStation}
							endStation={editData.endStation}
							beginLabel={editData.beginLabel}
							endLabel={editData.endLabel}
							height="100%"
							bind:mode={editMode}
							onRouteSave={persistRoute}
							onTerminusPick={persistTerminus}
						/>
					{/if}
				</div>
			{:else}
				<MapView center={initialCenter} zoom={11} height="100%" scrollZoom={true} bind:map={mapInstance}>
					{#snippet layers()}
						{#each visibleSites as site (site.id)}
							<JobMapLayer
								{site}
								focused={site.id === focusedId}
								onSelect={(id) => selectJob(id, { fly: false })}
							/>
						{/each}
					{/snippet}
				</MapView>
			{/if}
		{/if}
	</div>
</div>

<style>
	.map-page {
		position: relative;
		display: flex;
		width: 100%;
		height: calc(100vh - 60px);
		min-height: 480px;
		background: var(--background);
		border-radius: var(--radius-md, 8px);
		overflow: hidden;
	}

	.map-page.fullscreen {
		position: fixed;
		inset: 0;
		z-index: 2000;
		height: 100vh;
		border-radius: 0;
	}

	/* ── side panel ── */
	.panel {
		flex: 0 0 320px;
		width: 320px;
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border-right: 1px solid var(--border);
		min-height: 0;
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 16px;
		border-bottom: 1px solid var(--border);
	}
	.panel-head h2 {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 700;
	}
	.panel-sub {
		margin: 4px 0 0;
		font-size: 0.74rem;
		color: var(--text-muted);
	}
	.back-link {
		color: var(--text-muted);
		font-size: 0.82rem;
		white-space: nowrap;
	}
	.back-link:hover {
		color: var(--text);
	}

	.panel-tools {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}
	.search {
		width: 100%;
		min-height: 44px;
		padding: 8px 12px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 0.9rem;
	}
	.search:focus {
		outline: none;
		border-color: var(--accent, #f2c037);
	}
	.overlay-actions {
		display: flex;
		gap: 8px;
	}
	.mini-btn {
		flex: 1;
		min-height: 36px;
		padding: 6px 10px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}
	.mini-btn:hover {
		color: var(--text);
		border-color: var(--accent, #f2c037);
	}

	.role-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 16px 12px;
		padding: 8px 12px;
		background: color-mix(in srgb, var(--accent, #f2c037) 10%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--accent, #f2c037) 35%, var(--border));
		border-radius: 8px;
	}
	.role-banner-text {
		flex: 1;
		font-size: 0.78rem;
		line-height: 1.35;
		color: var(--text);
	}
	.role-banner-dismiss {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		background: none;
		border: none;
		border-radius: 6px;
		color: var(--text-muted);
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}
	.role-banner-dismiss:hover {
		color: var(--text);
		background: var(--surface-hover, rgba(255, 255, 255, 0.06));
	}

	.jobs-list {
		flex: 1;
		overflow-y: auto;
		padding: 10px;
		min-height: 0;
	}

	.job-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 6px 6px 8px;
		border: 1px solid transparent;
		border-radius: 8px;
		margin-bottom: 4px;
	}
	.job-row:hover {
		background: var(--surface-hover, rgba(255, 255, 255, 0.04));
	}
	.job-row.focused {
		border-color: color-mix(in srgb, var(--accent, #f2c037) 50%, transparent);
		background: color-mix(in srgb, var(--accent, #f2c037) 9%, transparent);
	}
	.job-row.needs-setup {
		border-color: color-mix(in srgb, var(--warn, #f59e0b) 45%, var(--border));
	}

	.job-main {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
		min-height: 44px;
		background: none;
		border: none;
		padding: 4px;
		text-align: left;
		cursor: pointer;
	}
	.job-swatch {
		flex: 0 0 10px;
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #475569;
	}
	.job-swatch.has-geo {
		background: #94a3b8;
	}
	.job-swatch.accent {
		background: var(--accent, #f2c037);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #f2c037) 30%, transparent);
	}
	.job-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.job-name {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.job-meta {
		font-size: 0.74rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.no-geo {
		color: color-mix(in srgb, var(--text-muted) 80%, transparent);
		font-style: italic;
	}

	.setup-badge {
		flex: 0 0 auto;
		align-self: center;
		padding: 2px 7px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--warn, #f59e0b) 18%, transparent);
		color: var(--warn, #f59e0b);
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.toggle {
		position: relative;
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		width: 40px;
		height: 44px;
		cursor: pointer;
	}
	.toggle input {
		position: absolute;
		opacity: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		cursor: pointer;
	}
	.toggle input:disabled {
		cursor: default;
	}
	.toggle-box {
		width: 34px;
		height: 20px;
		border-radius: 999px;
		background: var(--border);
		position: relative;
		transition: background 0.15s;
	}
	.toggle-box::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #fff;
		transition: transform 0.15s;
	}
	.toggle input:checked + .toggle-box {
		background: var(--accent, #f2c037);
	}
	.toggle input:checked + .toggle-box::after {
		transform: translateX(14px);
	}
	.toggle input:disabled + .toggle-box {
		opacity: 0.7;
	}

	.open-link {
		flex: 0 0 auto;
		display: grid;
		place-items: center;
		width: 32px;
		height: 44px;
		color: var(--text-muted);
		font-size: 1.3rem;
		line-height: 1;
		border-radius: 6px;
	}
	.open-link:hover {
		color: var(--accent, #f2c037);
		background: var(--surface-hover, rgba(255, 255, 255, 0.04));
	}

	.state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 36px 16px;
		color: var(--text-muted);
		text-align: center;
		font-size: 0.85rem;
	}
	.state-error {
		color: var(--bad, #ef4444);
	}
	.state-sub {
		margin: 0;
		font-size: 0.78rem;
		color: var(--text-muted);
	}
	.spinner {
		width: 28px;
		height: 28px;
		border: 3px solid var(--border);
		border-top-color: var(--accent, #f2c037);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* ── map area ── */
	.map-area {
		position: relative;
		flex: 1;
		min-width: 0;
	}

	.map-controls {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 600;
		display: flex;
		gap: 8px;
	}
	.ctl-btn {
		min-height: 40px;
		padding: 8px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		box-shadow: var(--shadow-sm);
	}
	.ctl-btn:hover {
		border-color: var(--accent, #f2c037);
	}

	.focus-banner {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 600;
		display: flex;
		align-items: center;
		gap: 8px;
		max-width: min(90%, 480px);
		padding: 8px 14px;
		background: var(--surface);
		border: 1px solid color-mix(in srgb, var(--accent, #f2c037) 40%, var(--border));
		border-radius: 999px;
		box-shadow: var(--shadow-sm);
		font-size: 0.85rem;
		overflow: hidden;
	}
	.focus-dot {
		flex: 0 0 auto;
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--accent, #f2c037);
	}
	.focus-banner strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.focus-route {
		color: var(--text-muted);
		font-size: 0.78rem;
		white-space: nowrap;
	}
	.focus-open {
		margin-left: 4px;
		color: var(--accent, #f2c037);
		font-weight: 600;
		white-space: nowrap;
	}

	.edit-switcher {
		position: absolute;
		top: 56px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 600;
		display: flex;
		gap: 4px;
		padding: 4px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 999px;
		box-shadow: var(--shadow-sm, 0 2px 8px rgba(0, 0, 0, 0.25));
	}
	.edit-btn {
		min-height: 40px;
		padding: 0 14px;
		background: transparent;
		border: none;
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: background var(--dur, 0.16s), color var(--dur, 0.16s);
	}
	.edit-btn:hover {
		color: var(--text);
	}
	.edit-btn.active {
		background: var(--accent);
		color: var(--accent-text);
	}

	.edit-surface {
		position: absolute;
		inset: 0;
		padding: 104px 12px 12px;
		overflow-y: auto;
		background: var(--background);
	}

	.edit-loading {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		height: 100%;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	/* ── mobile ── */
	@media (max-width: 767px) {
		.map-page {
			height: calc(100vh - 56px);
		}
		.panel {
			position: absolute;
			inset: auto 0 0 0;
			width: 100%;
			flex-basis: auto;
			height: 62vh;
			border-right: none;
			border-top: 1px solid var(--border);
			border-radius: 16px 16px 0 0;
			transform: translateY(100%);
			transition: transform 0.25s ease;
			z-index: 700;
		}
		.panel.open {
			transform: translateY(0);
		}
		.focus-banner {
			max-width: 78%;
		}
	}
</style>

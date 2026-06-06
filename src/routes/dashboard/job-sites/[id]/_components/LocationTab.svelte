<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { browser } from '$app/environment';
	import { MapPin } from 'lucide-svelte';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { polylineLengthFt, lineStringLengthFt } from '$lib/services/mapUtils';
	import type { PavingStatus } from '$lib/components/map-v2/RoadProgressLayer.svelte';
	import type { PageData } from '../$types';
	import type { ConfigForm } from './shared';
	import { fmt } from './shared';

	interface Photo {
		id: string;
		filename: string;
		caption?: string | null;
		taken_at: number;
		lat?: number | null;
		lng?: number | null;
	}
	interface PhotosResponse {
		photos?: Photo[];
	}

	let {
		data,
		configForm,
		onGoToTab
	}: {
		data: PageData;
		configForm: ConfigForm;
		onGoToTab: (tab: string) => void;
	} = $props();

	const hasCoords = $derived(data.jobSite.latitude != null && data.jobSite.longitude != null);
	const hasRoute = $derived((data.routeWaypoints?.length ?? 0) >= 2);

	// svelte-ignore state_referenced_locally
	let pickerLat = $state<number | null>(data.jobSite.latitude ?? null);
	// svelte-ignore state_referenced_locally
	let pickerLng = $state<number | null>(data.jobSite.longitude ?? null);
	let showLocationSearch = $state(false);
	let locationSaving = $state(false);
	let loadingRoute = $state(false);
	let gdotLookupLoading = $state(false);

	interface LocSection {
		id: string;
		name: string;
		lane?: string | null;
		station_start?: number | null;
		station_end?: number | null;
		status?: 'active' | 'completed' | 'skipped' | string;
		paving_status?: PavingStatus | null;
		geometry_geojson?: string | null;
		crew_name?: string | null;
		notes?: string | null;
	}
	let sections = $state<LocSection[]>([]);
	let selectedSection = $state<LocSection | null>(null);

	function dbStatus(s: string | undefined | null): PavingStatus {
		switch (s) {
			case 'completed': return 'completed';
			case 'active': return 'in_progress';
			case 'skipped': return 'skipped';
			default: return 'planned';
		}
	}
	const STATUS_COLORS_MAP: Record<PavingStatus, string> = {
		planned: '#94a3b8',
		scheduled_today: '#f2c037',
		in_progress: '#f59e0b',
		completed: '#22c55e',
		behind_schedule: '#ef4444',
		skipped: '#475569'
	};
	const STATUS_LABELS: Record<PavingStatus, string> = {
		planned: 'Planned',
		scheduled_today: 'Today',
		in_progress: 'In Progress',
		completed: 'Completed',
		behind_schedule: 'Behind',
		skipped: 'Skipped'
	};
	const statusColor = (s: PavingStatus) => STATUS_COLORS_MAP[s] ?? '#94a3b8';
	const statusLabel = (s: PavingStatus) => STATUS_LABELS[s] ?? s;

	$effect(() => {
		if (!browser) return;
		fetch(`/api/job-sites/${data.jobSite.id}/sections`)
			.then((res) => (res.ok ? res.json() : { sections: [] }))
			.then((d) => {
				sections = (d as { sections?: LocSection[] }).sections || [];
			})
			.catch(() => {
				sections = [];
			});
	});

	const routeLengthFt = $derived.by(() => {
		const wps = data.routeWaypoints;
		if (wps && wps.length >= 2) return polylineLengthFt(wps);
		return configForm.total_length_ft ?? null;
	});

	function sectionLengthFt(section: LocSection): number {
		if (!section.geometry_geojson) return 0;
		try {
			const geom = JSON.parse(section.geometry_geojson);
			if (geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return 0;
			return lineStringLengthFt(geom.coordinates as [number, number][]);
		} catch {
			return 0;
		}
	}
	const completedLengthFt = $derived(
		sections.filter((s) => s.status === 'completed').reduce((sum, s) => sum + sectionLengthFt(s), 0)
	);
	const remainingLengthFt = $derived(
		routeLengthFt != null ? Math.max(0, routeLengthFt - completedLengthFt) : null
	);

	async function handleLocationChange(lat: number | null, lng: number | null) {
		locationSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ latitude: lat, longitude: lng }),
				credentials: 'include'
			});
			if (res.ok) {
				toastStore.success('Location updated');
				showLocationSearch = false;
				await invalidateAll();
			} else {
				toastStore.error('Failed to update location');
			}
		} catch {
			toastStore.error('Failed to update location');
		} finally {
			locationSaving = false;
		}
	}
	async function clearCoordinates() {
		await handleLocationChange(null, null);
	}

	async function saveTerminus(field: 'begin' | 'end', station: number) {
		const patch = field === 'begin' ? { begin_station: station } : { end_station: station };
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
				credentials: 'include'
			});
			if (res.ok) toastStore.success(`${field === 'begin' ? 'Begin' : 'End'} terminus saved`);
			else toastStore.error('Failed to save terminus');
		} catch {
			toastStore.error('Failed to save terminus');
		}
	}

	async function loadRouteCenterline() {
		const designation = configForm.route_designation;
		if (!designation || loadingRoute) return;
		loadingRoute = true;
		try {
			const q = encodeURIComponent(designation);
			const res = await fetch(`/api/gdot-routes?q=${q}&geometry=true`, { credentials: 'include' });
			if (!res.ok) {
				toastStore.error('Could not reach GDOT route service');
				return;
			}
			const body = (await res.json()) as {
				routes?: Array<{ geometry?: { coordinates?: [number, number][] } | null }>;
			};
			const coords = body.routes?.find((r) => r.geometry?.coordinates?.length)?.geometry?.coordinates;
			if (!coords || coords.length < 2) {
				toastStore.error(`No GDOT geometry found for ${designation}`);
				return;
			}
			const waypoints = coords.map(([lng, lat]) => ({ lat, lng }));
			const save = await fetch(`/api/job-sites/${data.jobSite.id}/route`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ waypoints }),
				credentials: 'include'
			});
			if (save.ok) {
				toastStore.success(`Loaded ${designation} centerline`);
				await invalidateAll();
			} else {
				toastStore.error('Failed to save route');
			}
		} catch {
			toastStore.error('Could not load route centerline');
		} finally {
			loadingRoute = false;
		}
	}

	async function lookupGdotBoundaries() {
		gdotLookupLoading = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/gdot-lookup`, {
				method: 'POST',
				credentials: 'include'
			});
			if (res.ok) {
				const result = (await res.json()) as { county?: string | null; district?: string | null };
				data.jobSite.gdot_county = result.county ?? null;
				data.jobSite.gdot_district = result.district ?? null;
				toastStore.success('GDOT information updated');
			} else {
				const errorData = (await res.json()) as { error?: string };
				toastStore.error(errorData.error || 'Failed to lookup GDOT information');
			}
		} catch {
			toastStore.error('Failed to lookup GDOT information');
		} finally {
			gdotLookupLoading = false;
		}
	}

	// Plant location (haul route origin) persisted per-site in localStorage.
	function loadPlantLocation() {
		if (typeof localStorage === 'undefined') return { name: '', latitude: null, longitude: null };
		const stored = localStorage.getItem(`plant_${data.jobSite.id}`);
		if (!stored) return { name: '', latitude: null, longitude: null };
		try {
			return JSON.parse(stored);
		} catch {
			return { name: '', latitude: null, longitude: null };
		}
	}
	let plantForm = $state({ name: '', latitude: null as number | null, longitude: null as number | null });
	let plantSaved = $state(false);
	let plantLocation = $state(loadPlantLocation());
	function savePlantLocation() {
		if (typeof localStorage === 'undefined') return;
		const location = { name: plantForm.name, latitude: plantForm.latitude, longitude: plantForm.longitude };
		localStorage.setItem(`plant_${data.jobSite.id}`, JSON.stringify(location));
		plantLocation = location;
		plantSaved = true;
		setTimeout(() => (plantSaved = false), 2000);
	}
	function clearPlantLocation() {
		if (typeof localStorage === 'undefined') return;
		localStorage.removeItem(`plant_${data.jobSite.id}`);
		plantLocation = { name: '', latitude: null, longitude: null };
		plantForm = { name: '', latitude: null, longitude: null };
	}

	// Field photos.
	let photos = $state<Photo[]>([]);
	let photosLoading = $state(true);
	let selectedPhoto = $state<Photo | null>(null);
	async function loadPhotos() {
		photosLoading = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/photos`);
			if (!res.ok) return;
			const result = (await res.json()) as PhotosResponse;
			photos = result.photos ?? [];
			renderPhotoGrid();
		} catch {
			/* ignore */
		} finally {
			photosLoading = false;
		}
	}
	function renderPhotoGrid() {
		const grid = document.getElementById('loc-photo-grid');
		if (!grid) return;
		if (photos.length === 0) {
			grid.innerHTML = '<div class="empty-state-mini"><p>No photos yet</p></div>';
			return;
		}
		const esc = (str: string) =>
			str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
		grid.innerHTML = photos
			.map(
				(photo) => `
			<div class="photo-thumb" data-photo-id="${esc(String(photo.id))}">
				<img src="/api/job-sites/${esc(String(data.jobSite.id))}/photos/${esc(String(photo.id))}/view" alt="${esc(photo.caption || photo.filename)}" />
				${photo.caption ? `<div class="photo-caption">${esc(photo.caption)}</div>` : ''}
			</div>`
			)
			.join('');
		grid.querySelectorAll('.photo-thumb').forEach((el) => {
			el.addEventListener('click', () => {
				const photoId = el.getAttribute('data-photo-id');
				const photo = photos.find((p) => String(p.id) === photoId);
				if (photo) selectedPhoto = photo;
			});
		});
	}
	$effect(() => {
		if (browser && hasCoords) loadPhotos();
	});
</script>

<div class="location-tab">
	{#if !hasCoords || showLocationSearch}
		<section class="panel">
			<div class="panel-head">
				<h3>Set Project Location</h3>
				{#if hasCoords}
					<button type="button" class="link-btn" onclick={() => (showLocationSearch = false)}>Cancel</button>
				{/if}
			</div>
			<p class="lead">
				Drop the project pin or search an address. Everything on this page — the road route,
				sections, termini and work zones — builds off this location.
			</p>
			<JobSiteLocationPicker
				bind:latitude={pickerLat}
				bind:longitude={pickerLng}
				onchange={handleLocationChange}
				mapHeight="320px"
				showMapEager={true}
			/>
			{#if locationSaving}
				<p class="muted">Saving…</p>
			{/if}
		</section>
	{:else}
		<!-- Primary: editable road route -->
		<section class="panel">
			<div class="panel-head">
				<h3>Route Alignment</h3>
				<div class="head-actions">
					<button type="button" class="link-btn" onclick={() => (showLocationSearch = true)}>Change location</button>
					<button type="button" class="link-btn-sm" onclick={clearCoordinates}>Clear</button>
				</div>
			</div>
			<p class="lead">
				Tap <strong>Draw Route</strong>, then tap the road to drop points — the line follows real
				streets between them.
			</p>
			{#await import('$lib/components/RouteAlignmentMap.svelte')}
				<div class="map-mini-loading">Loading map…</div>
			{:then { default: RouteAlignmentMap }}
				<RouteAlignmentMap
					site={{
						id: data.jobSite.id,
						name: data.jobSite.name,
						status: data.jobSite.status as 'active' | 'completed' | 'archived',
						latitude: data.jobSite.latitude,
						longitude: data.jobSite.longitude,
						location_description: data.jobSite.location_description
					}}
					initialWaypoints={data.routeWaypoints}
					numLanes={data.config?.num_lanes}
					laneWidthFt={data.config?.lane_width_ft}
					height="440px"
					onRouteSave={async (waypoints) => {
						const res = await fetch(`/api/job-sites/${data.jobSite.id}/route`, {
							method: 'PUT',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ waypoints }),
							credentials: 'include'
						});
						if (res.ok) {
							toastStore.success('Route saved');
							await invalidateAll();
						} else {
							toastStore.error('Failed to save route');
						}
					}}
				/>
			{/await}
			<p class="coords">{data.jobSite.latitude?.toFixed(5)}, {data.jobSite.longitude?.toFixed(5)}</p>

			{#if !hasRoute && configForm.route_designation}
				<div class="route-cta">
					<p>
						This project is on <strong>{configForm.route_designation}</strong>. Load the GDOT
						centerline to start from the real road geometry.
					</p>
					<button type="button" class="btn-secondary" onclick={loadRouteCenterline} disabled={loadingRoute}>
						{loadingRoute ? 'Loading…' : `Load ${configForm.route_designation} centerline`}
					</button>
				</div>
			{/if}
		</section>

		<!-- Sections + lay-down paving -->
		<section class="panel">
			<div class="panel-head">
				<h3>Sections &amp; Paving Progress</h3>
			</div>
			<p class="lead">
				Set a start point on the road, then lay down a length of paving (e.g. “100 ft of Mix 1”).
				Completed lengths turn green.
			</p>
			{#if browser}
				{#await import('$lib/components/RoadSectionEditor.svelte')}
					<div class="map-mini-loading">Loading sections…</div>
				{:then { default: RoadSectionEditor }}
					<RoadSectionEditor
						siteId={data.jobSite.id}
						waypoints={data.routeWaypoints}
						numLanes={configForm.num_lanes}
						totalLengthFt={routeLengthFt}
						height="62vh"
					/>
				{/await}
			{/if}
		</section>

		{#if hasRoute}
			<!-- Project termini -->
			<section class="panel">
				<div class="panel-head">
					<h3>Project Termini</h3>
				</div>
				<p class="lead">Tap the road to set the begin/end points.</p>
				{#await import('$lib/components/map-v2/TerminusPicker.svelte')}
					<div class="map-mini-loading">Loading terminus picker…</div>
				{:then { default: TerminusPicker }}
					<TerminusPicker
						waypoints={data.routeWaypoints}
						bind:beginStation={configForm.begin_station}
						bind:endStation={configForm.end_station}
						beginLabel={configForm.begin_terminus}
						endLabel={configForm.end_terminus}
						height="320px"
						onPick={(field, station) => saveTerminus(field, station)}
					/>
				{/await}
			</section>

			<!-- Spread rate map -->
			<section class="panel">
				<div class="panel-head">
					<h3>Spread Rate Map</h3>
				</div>
				<p class="lead">Color-coded by spread rate vs target.</p>
				{#await import('$lib/components/SpreadRateHeatMap.svelte')}
					<div class="map-mini-loading">Loading spread rate map…</div>
				{:then { default: SpreadRateHeatMap }}
					<SpreadRateHeatMap
						site={{
							id: data.jobSite.id,
							name: data.jobSite.name,
							status: data.jobSite.status as 'active' | 'completed' | 'archived',
							latitude: data.jobSite.latitude,
							longitude: data.jobSite.longitude,
							location_description: data.jobSite.location_description
						}}
						waypoints={data.routeWaypoints}
						targetRate={configForm.target_spread_rate}
						toleranceLbsSy={5}
						height="320px"
					/>
				{/await}
			</section>
		{/if}

		<!-- GDOT reference -->
		<section class="panel">
			<div class="panel-head">
				<h3>GDOT Information</h3>
				{#if gdotLookupLoading}
					<button type="button" class="btn-secondary btn-sm" disabled>Updating…</button>
				{:else}
					<button type="button" class="btn-secondary btn-sm" onclick={lookupGdotBoundaries}>
						{data.jobSite.gdot_county ? 'Refresh' : 'Lookup'} GDOT Info
					</button>
				{/if}
			</div>
			<dl class="gdot-spec-list">
				<div class="spec-item"><dt>County</dt><dd>{data.jobSite.gdot_county || 'Unknown'}</dd></div>
				<div class="spec-item"><dt>District</dt><dd>{data.jobSite.gdot_district || 'Unknown'}</dd></div>
				{#if configForm.route_designation}
					<div class="spec-item"><dt>Route</dt><dd>{configForm.route_designation}</dd></div>
				{/if}
				{#if routeLengthFt}
					<div class="spec-item"><dt>Route Length</dt><dd>{fmt(routeLengthFt)} ft</dd></div>
				{/if}
			</dl>
			<button type="button" class="link-btn" onclick={() => onGoToTab('work_zones')}>Manage work zones →</button>
		</section>

		<!-- Haul route -->
		<section class="panel">
			<div class="panel-head">
				<h3>Haul Route</h3>
			</div>
			<p class="lead">Distance from the asphalt plant to the job site.</p>
			{#await import('$lib/components/HaulRouteMap.svelte')}
				<div class="map-mini-loading">Loading haul route…</div>
			{:then { default: HaulRouteMap }}
				<HaulRouteMap
					site={{
						id: data.jobSite.id,
						name: data.jobSite.name,
						latitude: data.jobSite.latitude,
						longitude: data.jobSite.longitude
					}}
					plant={plantLocation}
					avgSpeedMph={30}
					height="280px"
				/>
			{/await}
			{#if !plantLocation.latitude || !plantLocation.longitude}
				<div class="plant-form">
					<h4>Set Plant Location</h4>
					<div class="form-group">
						<label for="plant_name">Plant Name</label>
						<input type="text" id="plant_name" bind:value={plantForm.name} placeholder="e.g., Metro Asphalt Plant" />
					</div>
					<div class="form-row">
						<div class="form-group">
							<label for="plant_lat">Latitude</label>
							<input type="number" id="plant_lat" bind:value={plantForm.latitude} step="0.000001" />
						</div>
						<div class="form-group">
							<label for="plant_lng">Longitude</label>
							<input type="number" id="plant_lng" bind:value={plantForm.longitude} step="0.000001" />
						</div>
					</div>
					<button
						type="button"
						class="btn-primary"
						onclick={savePlantLocation}
						disabled={!plantForm.name || plantForm.latitude == null || plantForm.longitude == null}
					>
						Set Plant Location
					</button>
					{#if plantSaved}<div class="plant-saved">Plant location saved</div>{/if}
				</div>
			{:else}
				<div class="plant-info">
					<div class="plant-info-row"><span class="muted">Plant:</span> {plantLocation.name}</div>
					<div class="plant-info-row">
						<span class="muted">Location:</span>
						{plantLocation.latitude?.toFixed(5)}, {plantLocation.longitude?.toFixed(5)}
					</div>
					<button type="button" class="link-btn" onclick={clearPlantLocation}>Change Plant</button>
				</div>
			{/if}
		</section>

		<!-- Field photos -->
		<section class="panel">
			<div class="panel-head">
				<h3>Field Photos</h3>
				{#await import('$lib/components/PhotoCapture.svelte') then { default: PhotoCapture }}
					<PhotoCapture jobSiteId={data.jobSite.id} onUploaded={loadPhotos} compact={true} />
				{/await}
			</div>
			{#await import('$lib/components/PhotoGeoMap.svelte')}
				<div class="map-mini-loading">Loading photo map…</div>
			{:then { default: PhotoGeoMap }}
				<PhotoGeoMap
					jobSiteId={data.jobSite.id}
					lat={data.jobSite.latitude!}
					lng={data.jobSite.longitude!}
					height="320px"
				/>
			{/await}
			{#if photosLoading}
				<div class="photo-grid-loading">
					{#each Array(4) as _, i (i)}
						<Skeleton width="100px" height="100px" borderRadius="6px" />
					{/each}
				</div>
			{/if}
			<div class="photo-grid" id="loc-photo-grid"></div>
		</section>
	{/if}
</div>

{#if selectedPhoto}
	<dialog class="lightbox" open onclick={() => (selectedPhoto = null)}>
		<div class="lightbox-inner">
			<button type="button" class="lightbox-close" onclick={() => (selectedPhoto = null)} aria-label="Close">✕</button>
			<img
				src="/api/job-sites/{data.jobSite.id}/photos/{selectedPhoto.id}/view"
				alt={selectedPhoto.caption || selectedPhoto.filename}
			/>
			{#if selectedPhoto.caption}<div class="lightbox-caption">{selectedPhoto.caption}</div>{/if}
			<div class="lightbox-meta">
				{new Date(selectedPhoto.taken_at * 1000).toLocaleString()}
				{#if selectedPhoto.lat != null && selectedPhoto.lng != null}
					<span><MapPin size={14} style="display:inline-block;vertical-align:text-bottom;" /> {selectedPhoto.lat.toFixed(6)}, {selectedPhoto.lng.toFixed(6)}</span>
				{/if}
			</div>
		</div>
	</dialog>
{/if}

<style>
	.location-tab {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.panel-head h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.head-actions {
		display: flex;
		align-items: center;
		gap: 14px;
	}

	.lead {
		margin: 0 0 14px;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.muted {
		color: var(--text-muted);
	}

	.coords {
		margin: 10px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.route-cta {
		margin-top: 16px;
		padding: 14px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.route-cta p {
		margin: 0 0 12px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.gdot-spec-list {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 12px;
		margin: 0 0 14px;
	}

	.spec-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.spec-item dt {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.spec-item dd {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
	}

	.link-btn {
		background: none;
		border: 0;
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		padding: 0;
		min-height: 32px;
	}

	.link-btn-sm {
		background: none;
		border: 0;
		color: var(--text-muted);
		font-size: 0.8rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		min-height: 32px;
	}

	.btn-primary {
		min-height: 48px;
		padding: 0 16px;
		background: var(--accent);
		color: var(--accent-text);
		border: 1px solid var(--accent);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		min-height: 48px;
		padding: 0 16px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
	}

	.btn-secondary:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.btn-secondary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-sm {
		min-height: 40px;
		padding: 0 12px;
		font-size: 0.8rem;
	}

	.map-mini-loading {
		padding: 60px 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		background: var(--surface-alt, var(--surface));
		border-radius: var(--radius);
	}

	.plant-form {
		margin-top: 14px;
		padding: 14px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.plant-form h4 {
		margin: 0 0 12px;
		font-size: 0.9rem;
	}

	.form-row {
		display: flex;
		gap: 12px;
	}

	.form-group {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 12px;
	}

	.form-group label {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	.form-group input {
		min-height: 44px;
		padding: 0 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
	}

	.plant-saved {
		margin-top: 10px;
		font-size: 0.82rem;
		color: #22c55e;
	}

	.plant-info {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 14px;
		font-size: 0.88rem;
	}

	.plant-info-row {
		color: var(--text);
	}

	.photo-grid-loading {
		display: flex;
		gap: 10px;
		margin-top: 12px;
	}

	.photo-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
		gap: 10px;
		margin-top: 12px;
	}

	.photo-grid :global(.photo-thumb) {
		position: relative;
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		aspect-ratio: 1;
	}

	.photo-grid :global(.photo-thumb img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.photo-grid :global(.photo-caption) {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 4px 6px;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		font-size: 0.7rem;
	}

	.lightbox {
		position: fixed;
		inset: 0;
		width: 100%;
		height: 100%;
		max-width: none;
		max-height: none;
		border: 0;
		margin: 0;
		padding: 24px;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.lightbox-inner {
		position: relative;
		max-width: 90vw;
		max-height: 90vh;
	}

	.lightbox-inner img {
		max-width: 90vw;
		max-height: 80vh;
		border-radius: 8px;
	}

	.lightbox-close {
		position: absolute;
		top: -40px;
		right: 0;
		width: 36px;
		height: 36px;
		background: rgba(255, 255, 255, 0.15);
		color: #fff;
		border: 0;
		border-radius: 50%;
		cursor: pointer;
		font-size: 1rem;
	}

	.lightbox-caption {
		margin-top: 10px;
		color: #fff;
		font-size: 0.9rem;
	}

	.lightbox-meta {
		margin-top: 6px;
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.78rem;
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
	}

	@media (max-width: 640px) {
		.gdot-spec-list {
			grid-template-columns: 1fr;
		}

		.form-row {
			flex-direction: column;
			gap: 0;
		}
	}
</style>


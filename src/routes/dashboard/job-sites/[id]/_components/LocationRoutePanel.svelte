<script lang="ts">
	import { browser } from '$app/environment';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import { polylineLengthFt, stationToFeet } from '$lib/services/mapUtils';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { formatFeet } from '$lib/utils/format';
	import type { JobSite, RoadwayLogEvent, RouteWaypoint } from '../+page';
	import type { ConfigForm } from './shared';

	interface CountyBoundary {
		county: string;
		bounds: [[number, number], [number, number]];
		geojson: {
			type: 'Feature';
			properties?: { county?: string };
			geometry: { type: 'Polygon'; coordinates: number[][][] };
		};
	}
	type LocationPrecision = 'route' | 'point' | 'county' | 'none';

	let {
		jobSite,
		routeWaypoints = [],
		roadwayLogEvents = [],
		countyBoundary = null,
		configForm,
		numLanes = null,
		laneWidthFt = null,
		onLocationSaved,
		onRouteSaved
	}: {
		jobSite: JobSite;
		routeWaypoints?: RouteWaypoint[];
		roadwayLogEvents?: RoadwayLogEvent[];
		countyBoundary?: CountyBoundary | null;
		configForm: ConfigForm;
		numLanes?: number | null;
		laneWidthFt?: number | null;
		onLocationSaved?: (coords: {
			latitude: number | null;
			longitude: number | null;
			location_source?: string | null;
			location_precision?: string | null;
		}) => void;
		onRouteSaved?: (waypoints: RouteWaypoint[]) => void;
	} = $props();

	let showLocationSearch = $state(jobSite.latitude == null || jobSite.longitude == null);
	let locationSaving = $state(false);
	let loadingRoute = $state(false);
	let pickerLat = $state<number | null>(jobSite.latitude ?? null);
	let pickerLng = $state<number | null>(jobSite.longitude ?? null);

	const hasLocation = $derived(jobSite.latitude != null && jobSite.longitude != null);
	const locationPrecision = $derived<LocationPrecision>(
		jobSite.location_precision === 'route' ||
			jobSite.location_precision === 'point' ||
			jobSite.location_precision === 'county' ||
			jobSite.location_precision === 'none'
			? jobSite.location_precision
			: hasLocation
				? 'point'
				: 'none'
	);
	const hasExactLocation = $derived(hasLocation && locationPrecision !== 'county');
	const hasCountyContext = $derived(hasLocation && locationPrecision === 'county' && !!countyBoundary);
	const hasRoute = $derived(routeWaypoints.length >= 2);
	const hasRoadwayLog = $derived(roadwayLogEvents.length > 0);
	const hasProjectLimits = $derived(
		configForm.begin_station != null && configForm.end_station != null
	);
	const routeLengthFt = $derived(hasRoute ? polylineLengthFt(routeWaypoints) : null);
	const projectLimitLengthFt = $derived(
		hasProjectLimits
			? Math.abs(stationToFeet((configForm.end_station ?? 0) - (configForm.begin_station ?? 0)))
			: null
	);
	const currentSetupStep = $derived.by(() => {
		if (hasCountyContext) return 'County is known. Load or draw the exact road line next.';
		if (!hasExactLocation) return 'Move the pin onto the project area.';
		if (!hasRoute) return 'Load or draw the road line that the project follows.';
		if (!hasProjectLimits) return 'Set the project start and end along the road line.';
		return 'Route setup is ready for work zones and daily progress.';
	});

	async function handleLocationChange(lat: number | null, lng: number | null) {
		locationSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSite.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ latitude: lat, longitude: lng }),
				credentials: 'include'
			});
			if (res.ok) {
				const updated = (await res.json()) as {
					latitude: number | null;
					longitude: number | null;
					location_source?: string | null;
					location_precision?: string | null;
				};
				onLocationSaved?.({
					latitude: updated.latitude,
					longitude: updated.longitude,
					location_source: updated.location_source,
					location_precision: updated.location_precision
				});
				pickerLat = lat;
				pickerLng = lng;
				showLocationSearch = false;
				toastStore.success(lat == null || lng == null ? 'Location cleared' : 'Location updated');
			} else {
				toastStore.error('Failed to update location');
			}
		} catch {
			toastStore.error('Failed to update location');
		} finally {
			locationSaving = false;
		}
	}

	async function saveRoute(waypoints: RouteWaypoint[]) {
		const res = await fetch(`/api/job-sites/${jobSite.id}/route`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ waypoints }),
			credentials: 'include'
		});
		if (res.ok) {
			const body = (await res.json()) as {
				location?: {
					latitude: number | null;
					longitude: number | null;
					location_source?: string | null;
					location_precision?: string | null;
				} | null;
			};
			onRouteSaved?.(waypoints);
			if (body.location) onLocationSaved?.(body.location);
			toastStore.success('Route saved');
		} else {
			toastStore.error('Failed to save route');
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
			const coords = body.routes?.find((r) => r.geometry?.coordinates?.length)?.geometry
				?.coordinates;
			if (!coords || coords.length < 2) {
				toastStore.error(`No GDOT geometry found for ${designation}`);
				return;
			}
			await saveRoute(coords.map(([lng, lat]) => ({ lat, lng })));
		} catch {
			toastStore.error('Could not load route centerline');
		} finally {
			loadingRoute = false;
		}
	}

	async function saveTerminus(field: 'begin' | 'end', station: number) {
		const patch = field === 'begin' ? { begin_station: station } : { end_station: station };
		try {
			const res = await fetch(`/api/job-sites/${jobSite.id}/config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch),
				credentials: 'include'
			});
			if (res.ok) {
				if (field === 'begin') configForm.begin_station = station;
				else configForm.end_station = station;
				toastStore.success(`Project ${field === 'begin' ? 'start' : 'end'} saved`);
			} else {
				toastStore.error('Failed to save project limit');
			}
		} catch {
			toastStore.error('Failed to save project limit');
		}
	}
</script>

<section class="location-route-panel">
	<div class="panel-head">
		<div>
			<h3>Location &amp; Route</h3>
			<p>Define the stretch of real road this project uses, then mark the exact paving limits.</p>
		</div>
		{#if hasLocation}
			<button type="button" class="link-btn" onclick={() => (showLocationSearch = !showLocationSearch)}>
				{showLocationSearch ? 'Cancel' : hasExactLocation ? 'Change Location' : 'Set Exact Location'}
			</button>
		{/if}
	</div>

	<div class="setup-guide" aria-label="Route setup progress">
		<div class="setup-guide-main">
			<span class="setup-kicker">Goal</span>
			<strong>Turn the job location into a measured road project.</strong>
			<p>{currentSetupStep}</p>
		</div>
		<ol class="setup-steps">
			<li class:complete={hasExactLocation} class:active={!hasExactLocation}>
				<span>1</span>
				<div>
					<strong>{hasCountyContext ? 'County context' : 'Project pin'}</strong>
					<small>
						{#if hasExactLocation}
							Location is set
						{:else if hasCountyContext}
							{jobSite.gdot_county ?? countyBoundary?.county} County known
						{:else}
							Place it near the work
						{/if}
					</small>
				</div>
			</li>
			<li class:complete={hasRoute} class:active={hasLocation && !hasRoute}>
				<span>2</span>
				<div>
					<strong>Road line</strong>
					<small>{hasRoute ? formatFeet(routeLengthFt) : 'Load GDOT or draw snapped points'}</small>
				</div>
			</li>
			<li class:complete={hasProjectLimits} class:active={hasRoute && !hasProjectLimits}>
				<span>3</span>
				<div>
					<strong>Project limits</strong>
					<small>{hasProjectLimits ? formatFeet(projectLimitLengthFt) : 'Choose start and end'}</small>
				</div>
			</li>
			<li class:active={hasProjectLimits}>
				<span>4</span>
				<div>
					<strong>Work zones</strong>
					<small>{hasProjectLimits ? 'Ready to build sections' : 'Unlocks after limits'}</small>
				</div>
			</li>
		</ol>
	</div>

	{#if !hasLocation || showLocationSearch}
		<JobSiteLocationPicker
			bind:latitude={pickerLat}
			bind:longitude={pickerLng}
			onchange={handleLocationChange}
			mapHeight="300px"
			showMapEager={showLocationSearch}
		/>
		{#if locationSaving}
			<p class="saving">Saving...</p>
		{/if}
	{:else if browser}
		{#await import('$lib/components/RouteAlignmentMap.svelte')}
			<div class="map-mini-loading">Loading route map...</div>
		{:then { default: RouteAlignmentMap }}
			<RouteAlignmentMap
				site={{
					id: jobSite.id,
					name: jobSite.name,
					status: jobSite.status as 'active' | 'completed' | 'archived',
					latitude: jobSite.latitude,
					longitude: jobSite.longitude,
					location_description: jobSite.location_description
				}}
				initialWaypoints={routeWaypoints}
				{roadwayLogEvents}
				{numLanes}
				{laneWidthFt}
				locationPrecision={locationPrecision}
				countyBoundaryGeojson={countyBoundary?.geojson ?? null}
				countyBounds={countyBoundary?.bounds ?? null}
				countyName={jobSite.gdot_county ?? countyBoundary?.county ?? null}
				height="420px"
				onRouteSave={saveRoute}
			/>
		{/await}

		<div class="route-meta">
			<span>Pin: {jobSite.latitude?.toFixed(5)}, {jobSite.longitude?.toFixed(5)}</span>
			{#if hasRoute}
				<span>Road line: {formatFeet(routeLengthFt)}</span>
			{/if}
			{#if hasProjectLimits}
				<span>Project limits: {formatFeet(projectLimitLengthFt)}</span>
			{/if}
			<button type="button" class="link-btn-sm" onclick={() => handleLocationChange(null, null)}>
				Clear
			</button>
		</div>

		{#if !hasRoute}
			<div class="route-load">
				<div>
					<strong>No road line saved yet.</strong>
					<p>
						{#if configForm.route_designation}
							This project names <strong>{configForm.route_designation}</strong>. Load that GDOT road line,
							or use Edit Route on the map to add road-snapped points.
						{:else}
							Use Edit Route on the map to add road-snapped points in order along the project road.
						{/if}
					</p>
				</div>
				{#if configForm.route_designation}
					<button type="button" class="btn-secondary" onclick={loadRouteCenterline} disabled={loadingRoute}>
						{loadingRoute ? 'Loading...' : `Load ${configForm.route_designation} road line`}
					</button>
				{/if}
			</div>
		{/if}

		{#if hasRoute}
			<div class="terminus-block">
				<div class="terminus-head">
					<h4>Project Start &amp; End</h4>
					<span>Pick the limits of work along the saved road line.</span>
				</div>
				{#await import('$lib/components/map-v2/TerminusPicker.svelte')}
					<div class="map-mini-loading">Loading terminus picker...</div>
				{:then { default: TerminusPicker }}
					<TerminusPicker
						waypoints={routeWaypoints}
						bind:beginStation={configForm.begin_station}
						bind:endStation={configForm.end_station}
						beginLabel={configForm.begin_terminus}
						endLabel={configForm.end_terminus}
						height="300px"
						onPick={(field, station) => saveTerminus(field, station)}
					/>
				{/await}
			</div>
		{/if}

		{#if hasRoadwayLog}
			<div class="roadway-log-block">
				<div class="terminus-head">
					<h4>Imported Roadway Log</h4>
					<span>Events from the plan sheet, sorted by project mile.</span>
				</div>
				<div class="roadway-log-list">
					{#each roadwayLogEvents as event (event.id)}
						<div class="roadway-log-row" class:reference={event.is_reference === 1}>
							<span class="log-mile">{event.milepost.toFixed(3)}</span>
							<span class="log-type">{event.event_type.replace(/_/g, ' ')}</span>
							<span class="log-desc">{event.description}</span>
							{#if event.roadway_width_ft}
								<span class="log-width">{event.roadway_width_ft} ft</span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}
</section>

<style>
	.location-route-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 16px;
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}

	.panel-head h3,
	.terminus-head h4 {
		margin: 0;
	}

	.panel-head p,
	.terminus-head span,
	.route-load p {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: 0.86rem;
	}

	.setup-guide {
		display: grid;
		grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
		gap: 12px;
		margin-bottom: 14px;
		padding: 12px;
		background: color-mix(in srgb, var(--accent) 6%, var(--surface-alt));
		border: 1px solid color-mix(in srgb, var(--accent) 22%, var(--border));
		border-radius: 8px;
	}

	.setup-guide-main {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.setup-guide-main strong {
		color: var(--text);
		font-size: 0.98rem;
	}

	.setup-guide-main p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.86rem;
		line-height: 1.4;
	}

	.setup-kicker {
		color: var(--accent);
		font-size: 0.72rem;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.setup-steps {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.setup-steps li {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		min-width: 0;
		padding: 9px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		opacity: 0.78;
	}

	.setup-steps li.active,
	.setup-steps li.complete {
		opacity: 1;
	}

	.setup-steps li.active {
		border-color: var(--accent);
		box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 28%, transparent);
	}

	.setup-steps li.complete span {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.setup-steps span {
		display: grid;
		flex: 0 0 24px;
		width: 24px;
		height: 24px;
		place-items: center;
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text-muted);
		font-size: 0.78rem;
		font-weight: 800;
	}

	.setup-steps div {
		min-width: 0;
	}

	.setup-steps strong,
	.setup-steps small {
		display: block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.setup-steps strong {
		color: var(--text);
		font-size: 0.82rem;
	}

	.setup-steps small {
		color: var(--text-muted);
		font-size: 0.74rem;
	}

	.route-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.route-load,
	.terminus-block,
	.roadway-log-block {
		margin-top: 16px;
	}

	.route-load {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 12px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.route-load strong {
		color: var(--text);
	}

	.roadway-log-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 10px;
	}

	.roadway-log-row {
		display: grid;
		grid-template-columns: 64px 120px minmax(0, 1fr) auto;
		gap: 10px;
		align-items: start;
		padding: 9px 10px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-size: 0.82rem;
	}

	.roadway-log-row.reference {
		opacity: 0.78;
	}

	.log-mile {
		color: var(--accent);
		font-weight: 800;
	}

	.log-type {
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.log-desc {
		color: var(--text);
		line-height: 1.3;
	}

	.log-width {
		color: var(--text-muted);
		font-weight: 700;
		white-space: nowrap;
	}

	.saving {
		margin: 8px 0 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	@media (max-width: 640px) {
		.setup-guide,
		.setup-steps {
			grid-template-columns: 1fr;
		}

		.panel-head,
		.route-load {
			flex-direction: column;
			align-items: stretch;
		}

		.roadway-log-row {
			grid-template-columns: 58px 1fr;
		}

		.log-desc,
		.log-width {
			grid-column: 1 / -1;
		}
	}
</style>

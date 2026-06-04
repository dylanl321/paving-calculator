<script lang="ts">
	import { browser } from '$app/environment';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { JobSite, RouteWaypoint } from '../+page';
	import type { ConfigForm } from './shared';

	let {
		jobSite,
		routeWaypoints = [],
		configForm,
		numLanes = null,
		laneWidthFt = null,
		onLocationSaved,
		onRouteSaved
	}: {
		jobSite: JobSite;
		routeWaypoints?: RouteWaypoint[];
		configForm: ConfigForm;
		numLanes?: number | null;
		laneWidthFt?: number | null;
		onLocationSaved?: (coords: { latitude: number | null; longitude: number | null }) => void;
		onRouteSaved?: (waypoints: RouteWaypoint[]) => void;
	} = $props();

	let showLocationSearch = $state(jobSite.latitude == null || jobSite.longitude == null);
	let locationSaving = $state(false);
	let loadingRoute = $state(false);
	let pickerLat = $state<number | null>(jobSite.latitude ?? null);
	let pickerLng = $state<number | null>(jobSite.longitude ?? null);

	const hasLocation = $derived(jobSite.latitude != null && jobSite.longitude != null);
	const hasRoute = $derived(routeWaypoints.length >= 2);

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
				onLocationSaved?.({ latitude: lat, longitude: lng });
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
			onRouteSaved?.(waypoints);
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
				toastStore.success(`${field === 'begin' ? 'Begin' : 'End'} terminus saved`);
			} else {
				toastStore.error('Failed to save terminus');
			}
		} catch {
			toastStore.error('Failed to save terminus');
		}
	}
</script>

<section class="location-route-panel">
	<div class="panel-head">
		<div>
			<h3>Location &amp; Route</h3>
			<p>Set the project pin, save the road-following route, then build work zones from stations.</p>
		</div>
		{#if hasLocation}
			<button type="button" class="link-btn" onclick={() => (showLocationSearch = !showLocationSearch)}>
				{showLocationSearch ? 'Cancel' : 'Change Location'}
			</button>
		{/if}
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
				{numLanes}
				{laneWidthFt}
				height="420px"
				onRouteSave={saveRoute}
			/>
		{/await}

		<div class="route-meta">
			<span>{jobSite.latitude?.toFixed(5)}, {jobSite.longitude?.toFixed(5)}</span>
			<button type="button" class="link-btn-sm" onclick={() => handleLocationChange(null, null)}>
				Clear
			</button>
		</div>

		{#if configForm.route_designation && !hasRoute}
			<div class="route-load">
				<p>
					This project names <strong>{configForm.route_designation}</strong>. Load its GDOT centerline
					or draw the road alignment above.
				</p>
				<button type="button" class="btn-secondary" onclick={loadRouteCenterline} disabled={loadingRoute}>
					{loadingRoute ? 'Loading...' : `Load ${configForm.route_designation} centerline`}
				</button>
			</div>
		{/if}

		{#if hasRoute}
			<div class="terminus-block">
				<div class="terminus-head">
					<h4>Project Termini</h4>
					<span>Tap the road to set begin/end points.</span>
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

	.route-meta {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 10px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.route-load,
	.terminus-block {
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

	.saving {
		margin: 8px 0 0;
		color: var(--text-muted);
		font-size: 0.85rem;
	}

	@media (max-width: 640px) {
		.panel-head,
		.route-load {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>

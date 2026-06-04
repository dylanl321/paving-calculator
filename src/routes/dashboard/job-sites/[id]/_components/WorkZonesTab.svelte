<script lang="ts">
	import type { JobSite, RouteWaypoint } from '../+page';
	import type { ConfigForm } from './shared';
	import LocationRoutePanel from './LocationRoutePanel.svelte';

	let {
		jobSite,
		routeWaypoints = [],
		numLanes = null,
		laneWidthFt = null,
		totalLengthFt = null,
		configForm,
		onLocationSaved,
		onRouteSaved
	}: {
		jobSite: JobSite;
		routeWaypoints?: RouteWaypoint[];
		numLanes?: number | null;
		laneWidthFt?: number | null;
		totalLengthFt?: number | null;
		configForm: ConfigForm;
		onLocationSaved?: (coords: { latitude: number | null; longitude: number | null }) => void;
		onRouteSaved?: (waypoints: RouteWaypoint[]) => void;
	} = $props();
</script>

<section class="section">
	<LocationRoutePanel
		{jobSite}
		{routeWaypoints}
		{configForm}
		{numLanes}
		{laneWidthFt}
		{onLocationSaved}
		{onRouteSaved}
	/>

	{#if jobSite.latitude != null && jobSite.longitude != null}
		{#await import('$lib/components/WorkZoneMap.svelte')}
			<div class="map-mini-loading">Loading work zones...</div>
		{:then { default: WorkZoneMap }}
			<WorkZoneMap
				orgId={jobSite.org_id}
				siteId={jobSite.id}
				lat={jobSite.latitude!}
				lng={jobSite.longitude!}
			/>
		{/await}

		<div class="sections-block">
			<div class="sections-heading">
				<h4>Sections — where paving occurs</h4>
				<p>Mark start/end points along the route to track completed vs. remaining length.</p>
			</div>
			{#await import('$lib/components/RoadSectionEditor.svelte')}
				<div class="map-mini-loading">Loading sections...</div>
			{:then { default: RoadSectionEditor }}
				<RoadSectionEditor
					siteId={jobSite.id}
					waypoints={routeWaypoints}
					{numLanes}
					{totalLengthFt}
				/>
			{/await}
		</div>
	{/if}
</section>

<style>
	.sections-block {
		margin-top: 24px;
	}

	.sections-heading {
		margin-bottom: 12px;
	}

	.sections-heading h4 {
		margin: 0 0 4px;
		font-size: 1.05rem;
	}

	.sections-heading p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}
</style>

<script lang="ts">
	import type { JobSite, RouteWaypoint } from '../+page';

	let {
		jobSite,
		routeWaypoints = [],
		numLanes = null,
		totalLengthFt = null,
		onGoToOverview
	}: {
		jobSite: JobSite;
		routeWaypoints?: RouteWaypoint[];
		numLanes?: number | null;
		totalLengthFt?: number | null;
		onGoToOverview: () => void;
	} = $props();
</script>

<section class="section">
	{#if jobSite.latitude == null || jobSite.longitude == null}
		<div class="empty-state">
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
			<h4>Location Required</h4>
			<p>Set a location for this job site to use work zones</p>
			<button class="btn-primary" style="margin-top: 16px;" onclick={onGoToOverview}>
				Go to Overview
			</button>
		</div>
	{:else}
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

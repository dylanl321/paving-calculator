<!--
	WorkScheduleTab — the consolidated "Work & Schedule" workspace tab. Combines
	the former Work Zones and Schedule tabs into one surface by rendering the
	existing WorkZonesTab and ScheduleTab components as two sections. Behavior and
	markup of the underlying tabs are reused as-is (WorkZonesTab still embeds the
	WorkZoneMap); this component only adds the section framing via SectionHeader.
-->
<script lang="ts">
	import type { JobSite, RouteWaypoint, Milestone } from '../+page';
	import type { ConfigForm } from './shared';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import WorkZonesTab from './WorkZonesTab.svelte';
	import ScheduleTab from './ScheduleTab.svelte';

	interface CountyBoundary {
		county: string;
		bounds: [[number, number], [number, number]];
		geojson: {
			type: 'Feature';
			properties?: { county?: string };
			geometry: { type: 'Polygon'; coordinates: number[][][] };
		};
	}

	let {
		jobSite,
		jobSiteId,
		routeWaypoints = [],
		countyBoundary = null,
		numLanes = null,
		laneWidthFt = null,
		totalLengthFt = null,
		configForm,
		milestones = $bindable(),
		totalTonnage = null,
		estStartDate = null,
		onLocationSaved,
		onRouteSaved
	}: {
		jobSite: JobSite;
		jobSiteId: string;
		routeWaypoints?: RouteWaypoint[];
		countyBoundary?: CountyBoundary | null;
		numLanes?: number | null;
		laneWidthFt?: number | null;
		totalLengthFt?: number | null;
		configForm: ConfigForm;
		milestones: Milestone[];
		totalTonnage?: number | null;
		estStartDate?: string | null;
		onLocationSaved?: (coords: {
			latitude: number | null;
			longitude: number | null;
			location_source?: string | null;
			location_precision?: string | null;
		}) => void;
		onRouteSaved?: (waypoints: RouteWaypoint[]) => void;
	} = $props();
</script>

<div class="work-schedule">
	<section class="work-schedule__group">
		<SectionHeader
			title="Work zones"
			subtitle="Map the route and the sections where paving occurs."
			as="h3"
		/>
		<WorkZonesTab
			{jobSite}
			{routeWaypoints}
			{countyBoundary}
			{numLanes}
			{laneWidthFt}
			{totalLengthFt}
			{configForm}
			{onLocationSaved}
			{onRouteSaved}
		/>
	</section>

	<section class="work-schedule__group">
		<SectionHeader
			title="Schedule"
			subtitle="Track project phases and milestones against tonnage."
			as="h3"
		/>
		<ScheduleTab {jobSiteId} bind:milestones {totalTonnage} {estStartDate} />
	</section>
</div>

<style>
	.work-schedule {
		display: flex;
		flex-direction: column;
		gap: var(--sp-8, 40px);
	}

	.work-schedule__group {
		min-width: 0;
	}
</style>

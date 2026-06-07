<!--
	PlanTab — the merged "Plan" surface. It resolves the old Location-vs-Work
	duplication by mounting the single ProjectMapWorkspace exactly ONCE (via
	LocationRoutePanel) and then composing the schedule, configuration, and a
	setup-completeness summary as sections beneath it. It reuses the existing
	LocationRoutePanel / ScheduleTab / ConfigurationTab components as-is — it does
	not re-mount WorkScheduleTab (which would mount a second map through
	WorkZonesTab). Preserves every binding the underlying components need.
-->
<script lang="ts">
	import type { JobSite, RouteWaypoint, Milestone, RoadwayLogEvent } from '../+page';
	import type { ConfigForm } from './shared';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import LocationRoutePanel from './LocationRoutePanel.svelte';
	import ScheduleTab from './ScheduleTab.svelte';
	import ConfigurationTab from './ConfigurationTab.svelte';

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
		roadwayLogEvents = [],
		countyBoundary = null,
		configForm = $bindable(),
		milestones = $bindable(),
		estTonnage = null,
		totalTonnage = null,
		estStartDate = null,
		setupScore = null,
		missingFields = [],
		onLengthManualEdit,
		onLocationSaved,
		onRouteSaved
	}: {
		jobSite: JobSite;
		jobSiteId: string;
		routeWaypoints?: RouteWaypoint[];
		roadwayLogEvents?: RoadwayLogEvent[];
		countyBoundary?: CountyBoundary | null;
		configForm: ConfigForm;
		milestones: Milestone[];
		estTonnage?: number | null;
		totalTonnage?: number | null;
		estStartDate?: string | null;
		setupScore?: number | null;
		missingFields?: string[];
		onLengthManualEdit?: () => void;
		onLocationSaved?: (coords: {
			latitude: number | null;
			longitude: number | null;
			location_source?: string | null;
			location_precision?: string | null;
		}) => void;
		onRouteSaved?: (waypoints: RouteWaypoint[]) => void;
	} = $props();

	const setupTone = $derived(
		setupScore == null
			? 'flat'
			: setupScore >= 90
				? 'good'
				: setupScore >= 60
					? 'warn'
					: 'bad'
	);
</script>

<div class="plan-tab">
	{#if setupScore != null && setupScore < 90}
		<section class="plan-tab__group plan-setup">
			<div class="plan-setup__score plan-setup__score--{setupTone}">
				<span class="plan-setup__pct">{setupScore}%</span>
				<span class="plan-setup__pct-label">setup</span>
			</div>
			<div class="plan-setup__body">
				<strong>Finish project setup</strong>
				{#if missingFields.length > 0}
					<p>Still missing: {missingFields.join(', ')}.</p>
				{:else}
					<p>Add the remaining route, schedule and configuration details below.</p>
				{/if}
			</div>
		</section>
	{/if}

	<section class="plan-tab__group">
		<LocationRoutePanel
			{jobSite}
			{routeWaypoints}
			{roadwayLogEvents}
			{countyBoundary}
			{configForm}
			numLanes={configForm.num_lanes}
			laneWidthFt={configForm.lane_width_ft}
			{onLocationSaved}
			{onRouteSaved}
		/>
	</section>

	<section class="plan-tab__group">
		<SectionHeader
			title="Schedule"
			subtitle="Track project phases and milestones against tonnage."
			as="h3"
		/>
		<ScheduleTab {jobSiteId} bind:milestones {totalTonnage} {estStartDate} />
	</section>

	<section class="plan-tab__group">
		<SectionHeader
			title="Configuration"
			subtitle="Roadway, mix specs, route designation and contract values."
			as="h3"
		/>
		<ConfigurationTab
			{jobSiteId}
			bind:configForm
			{estTonnage}
			lat={jobSite.latitude}
			lng={jobSite.longitude}
			{onLengthManualEdit}
		/>
	</section>
</div>

<style>
	.plan-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-8, 40px);
	}

	.plan-tab__group {
		min-width: 0;
	}

	.plan-setup {
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-4);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.plan-setup__score {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 72px;
		height: 72px;
		border-radius: var(--radius-md);
		background: var(--surface-alt);
		border: 2px solid var(--border);
	}

	.plan-setup__score--good {
		border-color: var(--good);
		color: var(--good);
	}
	.plan-setup__score--warn {
		border-color: var(--warn);
		color: var(--warn);
	}
	.plan-setup__score--bad {
		border-color: var(--bad);
		color: var(--bad);
	}

	.plan-setup__pct {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.plan-setup__pct-label {
		font-size: var(--fs-2xs);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.plan-setup__body {
		min-width: 0;
	}

	.plan-setup__body strong {
		display: block;
		font-size: var(--fs-md);
		color: var(--text);
		margin-bottom: var(--sp-1);
	}

	.plan-setup__body p {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}
</style>

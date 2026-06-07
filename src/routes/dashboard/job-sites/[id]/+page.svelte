<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';
	import type { PageData } from './$types';
	import './_components/job-site.css';
	import { type ConfigForm } from './_components/shared';
	import CommandTab from './_components/CommandTab.svelte';
	import PlanTab from './_components/PlanTab.svelte';
	import ProductionTab from './_components/ProductionTab.svelte';
	import ResourcesTab from './_components/ResourcesTab.svelte';
	import RecordsTab from './_components/RecordsTab.svelte';
	import { polylineLengthFt } from '$lib/services/mapUtils';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { fmt } from './_components/shared';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Breadcrumbs from '$lib/components/ui/Breadcrumbs.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import StatTile from '$lib/components/ui/StatTile.svelte';
	import ProjectContextBar from '$lib/components/ProjectContextBar.svelte';

	let { data }: { data: PageData } = $props();

	let activeTab = $state('command');
	// Intentional one-time snapshots of loaded data into editable form state;
	// these should NOT re-derive from `data` on every change.
	// svelte-ignore state_referenced_locally
	let jobSiteState = $state({ ...data.jobSite });
	let statusSaving = $state(false);
	// svelte-ignore state_referenced_locally
	let routeWaypointsState = $state([...data.routeWaypoints]);
	// svelte-ignore state_referenced_locally
	let lengthSource = $state<'route' | 'manual'>(
		data.routeWaypoints?.length >= 2 && !data.config?.total_length_ft ? 'route' : 'manual'
	);

	// Intentional one-time snapshot of loaded data for an editable form; should
	// NOT re-derive from `data` on every change.
	// svelte-ignore state_referenced_locally
	let configForm = $state<ConfigForm>({
		road_type: data.config?.road_type || null,
		num_lanes: data.config?.num_lanes || null,
		lane_width_ft: data.config?.lane_width_ft || orgSettingsStore.resolvedDefaults.roadWidthFt,
		total_length_ft: data.config?.total_length_ft || null,
		scope_of_work: data.config?.scope_of_work || null,
		mix_type: data.config?.mix_type || null,
		target_thickness_in: data.config?.target_thickness_in || null,
		target_spread_rate: data.config?.target_spread_rate || null,
		tack_type: data.config?.tack_type || null,
		target_tack_rate: data.config?.target_tack_rate || null,
		notes: data.config?.notes || null,
		route_designation: data.config?.route_designation || null,
		route_county: data.config?.route_county || null,
		route_district: data.config?.route_district || null,
		route_functional_class: data.config?.route_functional_class || null,
		route_system_code: data.config?.route_system_code || null,
		begin_terminus: data.config?.begin_terminus || null,
		end_terminus: data.config?.end_terminus || null,
		begin_station: data.config?.begin_station ?? null,
		end_station: data.config?.end_station ?? null,
		num_lifts: data.config?.num_lifts || null,
		total_tonnage: data.config?.total_tonnage || null,
		cost_per_ton: data.config?.cost_per_ton || null,
		cost_per_sy: data.config?.cost_per_sy || null,
		cost_per_mile: data.config?.cost_per_mile || null,
		total_contract_value: data.config?.total_contract_value || null
	});

	// svelte-ignore state_referenced_locally
	let equipmentList = $state([...data.equipment]);
	// svelte-ignore state_referenced_locally
	let milestones = $state([...data.milestones]);

	$effect(() => {
		if (
			configForm.target_thickness_in !== null &&
			configForm.target_thickness_in > 0 &&
			!configForm.target_spread_rate
		) {
			configForm.target_spread_rate =
				configForm.target_thickness_in * orgSettingsStore.resolvedConstant('CONST.THICK_MULT');
		}
	});

	$effect(() => {
		calcContext.seedFromJobSite(data.config);
	});

	$effect(() => {
		const wps = routeWaypointsState;
		if (wps && wps.length >= 2 && (lengthSource === 'route' || !configForm.total_length_ft)) {
			const ft = polylineLengthFt(wps);
			if (ft > 0) {
				configForm.total_length_ft = Math.round(ft);
				lengthSource = 'route';
			}
		}
	});

	function handleLengthManualEdit() {
		lengthSource = 'manual';
	}

	function handleNewCalculation() {
		goto(`/app?job_site_id=${jobSiteState.id}&tool=production-check`);
	}

	async function updateProjectStatus(status: 'active' | 'completed' | 'archived') {
		if (statusSaving || jobSiteState.status === status) return;
		statusSaving = true;
		try {
			const updated = await api.patch<typeof jobSiteState>(`/api/job-sites/${jobSiteState.id}`, {
				status
			});
			jobSiteState = { ...jobSiteState, status: updated.status };
			toastStore.success(
				status === 'archived'
					? 'Project archived'
					: status === 'completed'
						? 'Project marked complete'
						: 'Project reactivated'
			);
		} finally {
			statusSaving = false;
		}
	}

	const totalAreaSqYd = $derived.by(() => {
		const len = configForm.total_length_ft;
		const lanes = configForm.num_lanes;
		const width = configForm.lane_width_ft;
		if (!len || !lanes || !width) return null;
		return (len * lanes * width) / 9;
	});

	const estTonnage = $derived.by(() => {
		if (!totalAreaSqYd || !configForm.target_spread_rate) return null;
		return (totalAreaSqYd * configForm.target_spread_rate) / 2000;
	});

	const estCostByTon = $derived.by(() => {
		const tonnage = configForm.total_tonnage || estTonnage;
		if (!configForm.cost_per_ton || !tonnage) return null;
		return configForm.cost_per_ton * tonnage;
	});

	const estCostBySY = $derived.by(() => {
		if (!configForm.cost_per_sy || !totalAreaSqYd) return null;
		return configForm.cost_per_sy * totalAreaSqYd;
	});

	const estCostByMile = $derived.by(() => {
		if (!configForm.cost_per_mile || !configForm.total_length_ft) return null;
		return configForm.cost_per_mile * (configForm.total_length_ft / 5280);
	});

	const milestonePct = $derived.by(() => {
		if (!milestones.length) return null;
		const done = milestones.filter((m) => m.status === 'completed').length;
		return Math.round((done / milestones.length) * 100);
	});

	const costSummary = $derived.by(() => {
		if (configForm.total_contract_value) {
			return { value: configForm.total_contract_value, method: 'Contract Value' };
		}
		if (estCostByTon) {
			return { value: estCostByTon, method: 'Est. by Tonnage' };
		}
		if (estCostBySY) {
			return { value: estCostBySY, method: 'Est. by Area' };
		}
		if (estCostByMile) {
			return { value: estCostByMile, method: 'Est. by Mileage' };
		}
		return null;
	});

	// Setup completeness — same required-field model as the old Overview, surfaced
	// here so the context bar, Command hub and Plan tab share one score.
	const setupCompleteness = $derived.by(() => {
		const requiredConfig = [
			'road_type',
			'num_lanes',
			'lane_width_ft',
			'total_length_ft',
			'scope_of_work',
			'mix_type',
			'target_thickness_in',
			'target_spread_rate'
		];
		const requiredSite = ['name', 'status'];
		const labels: Record<string, string> = {
			road_type: 'Road Type',
			num_lanes: 'Number of Lanes',
			lane_width_ft: 'Lane Width',
			total_length_ft: 'Total Length',
			scope_of_work: 'Scope of Work',
			mix_type: 'Mix Type',
			target_thickness_in: 'Target Thickness',
			target_spread_rate: 'Target Spread Rate',
			name: 'Job Name',
			status: 'Status'
		};
		const isEmpty = (v: unknown) => v === null || v === undefined || v === '' || v === 0;
		const missing: string[] = [];
		let filled = 0;
		for (const f of requiredConfig) {
			if (isEmpty((configForm as unknown as Record<string, unknown>)[f])) missing.push(labels[f] ?? f);
			else filled++;
		}
		for (const f of requiredSite) {
			if (isEmpty((jobSiteState as unknown as Record<string, unknown>)[f])) missing.push(labels[f] ?? f);
			else filled++;
		}
		const total = requiredConfig.length + requiredSite.length;
		const score = Math.round((filled / total) * 100);
		return { score, missing };
	});

	const tabs = $derived([
		{ id: 'command', label: 'Command' },
		{ id: 'plan', label: 'Plan' },
		{ id: 'production', label: 'Production' },
		{ id: 'resources', label: 'Resources', count: equipmentList.length || null },
		{ id: 'records', label: 'Records' }
	]);
</script>

<svelte:head>
	<title>{jobSiteState.name} — {config.app.name}</title>
</svelte:head>

<div class="dashboard job-site-page">
	<div class="breadcrumb">
		<Breadcrumbs
			crumbs={[
				{ label: 'Projects', href: '/dashboard/projects' },
				{ label: jobSiteState.name }
			]}
		/>
	</div>

	<ProjectContextBar
		name={jobSiteState.name}
		status={jobSiteState.status}
		contractValue={configForm.total_contract_value}
		routeDesignation={configForm.route_designation}
		county={jobSiteState.gdot_county ?? configForm.route_county}
		setupScore={setupCompleteness.score}
	/>

	<PageHeader title={jobSiteState.name} as="h2">
		{#snippet children()}
			<div class="page-meta">
				<StatusBadge status={jobSiteState.status} />
				{#if jobSiteState.location_description}
					<span class="meta-location">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
							<circle cx="12" cy="10" r="3"></circle>
						</svg>
						{jobSiteState.location_description}
					</span>
				{/if}
			</div>
		{/snippet}
		{#snippet actions()}
			<div class="header-actions">
				{#if jobSiteState.status === 'active'}
					<Button variant="ghost" size="sm" onclick={() => updateProjectStatus('completed')} disabled={statusSaving}>
						Mark Complete
					</Button>
					<Button variant="ghost" size="sm" onclick={() => updateProjectStatus('archived')} disabled={statusSaving}>
						Archive
					</Button>
				{:else}
					<Button variant="ghost" size="sm" onclick={() => updateProjectStatus('active')} disabled={statusSaving}>
						Reactivate
					</Button>
				{/if}
				<Button variant="ghost" size="sm" href="/dashboard/job-sites/{jobSiteState.id}/log">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
						<polyline points="14 2 14 8 20 8"></polyline>
					</svg>
					Today's Log
				</Button>
				<Button size="sm" onclick={handleNewCalculation}>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<rect x="4" y="2" width="16" height="20" rx="2"></rect>
						<line x1="8" y1="6" x2="16" y2="6"></line>
						<line x1="8" y1="10" x2="16" y2="10"></line>
					</svg>
					Open Calculator
				</Button>
			</div>
		{/snippet}
	</PageHeader>

	<div class="desktop-layout">
		<div class="desktop-main">
			<nav class="tabs">
				{#each tabs as tab (tab.id)}
					<button
						class="tab"
						class:active={activeTab === tab.id}
						onclick={() => (activeTab = tab.id)}
					>
						{tab.label}{#if tab.count}<span class="tab-count">{tab.count}</span>{/if}
					</button>
				{/each}
			</nav>

			{#if activeTab === 'command'}
				<CommandTab
					data={{
						...data,
						jobSite: jobSiteState,
						routeWaypoints: routeWaypointsState,
						countyBoundary: data.countyBoundary
					}}
					{configForm}
					{totalAreaSqYd}
					{estTonnage}
					{costSummary}
					{milestonePct}
					equipmentCount={equipmentList.length}
					setupScore={setupCompleteness.score}
					missingFields={setupCompleteness.missing}
					onGoToTab={(tab) => (activeTab = tab)}
				/>
			{:else if activeTab === 'plan'}
				<PlanTab
					jobSite={jobSiteState}
					jobSiteId={jobSiteState.id}
					routeWaypoints={routeWaypointsState}
					roadwayLogEvents={data.roadwayLogEvents}
					countyBoundary={data.countyBoundary}
					bind:configForm
					bind:milestones
					{estTonnage}
					totalTonnage={data.config?.total_tonnage ?? null}
					estStartDate={jobSiteState.est_start_date ?? null}
					setupScore={setupCompleteness.score}
					missingFields={setupCompleteness.missing}
					onLengthManualEdit={handleLengthManualEdit}
					onLocationSaved={(coords) => {
						jobSiteState = { ...jobSiteState, ...coords };
					}}
					onRouteSaved={(waypoints) => {
						routeWaypointsState = [...waypoints];
					}}
				/>
			{:else if activeTab === 'production'}
				<ProductionTab
					jobSiteId={jobSiteState.id}
					calculations={data.calculations}
					onNewCalculation={handleNewCalculation}
				/>
			{:else if activeTab === 'resources'}
				<ResourcesTab
					jobSiteId={jobSiteState.id}
					jobSiteName={jobSiteState.name}
					bind:equipmentList
					assignments={data.assignments}
				/>
			{:else if activeTab === 'records'}
				<RecordsTab
					jobSiteId={jobSiteState.id}
					{configForm}
					onGoToTab={(tab) => (activeTab = tab)}
				/>
			{/if}
		</div>

		<aside class="desktop-sidebar">
			{#if jobSiteState.latitude != null && jobSiteState.longitude != null}
				<Card title="Map Preview" padding="sm">
					<div class="sidebar-map">
						{#await import('$lib/components/JobSiteMap.svelte')}
							<div class="map-loading">Loading map...</div>
						{:then { default: JobSiteMap }}
							<JobSiteMap
								sites={[{
									id: jobSiteState.id,
									name: jobSiteState.name,
									status: jobSiteState.status as 'active' | 'completed' | 'archived',
									latitude: jobSiteState.latitude,
									longitude: jobSiteState.longitude,
									location_description: jobSiteState.location_description
								}]}
								height="200px"
							/>
						{/await}
					</div>
				</Card>
			{/if}

			<Card title="Key Stats">
				<div class="sidebar-stats">
					<StatTile label="Total Area" value={totalAreaSqYd ? fmt(totalAreaSqYd) : '—'} unit={totalAreaSqYd ? 'yd²' : undefined} />
					<StatTile label="Est. Tonnage" value={estTonnage ? fmt(estTonnage, 1) : '—'} unit={estTonnage ? 't' : undefined} />
					{#if costSummary}
						<StatTile label={costSummary.method} value={`$${fmt(costSummary.value, 0)}`} accent />
					{/if}
					<StatTile label="Progress" value={milestonePct != null ? milestonePct : '—'} unit={milestonePct != null ? '%' : undefined} />
				</div>
			</Card>

			<Card padding="sm">
				<div class="sidebar-actions">
					{#if jobSiteState.status === 'active'}
						<Button variant="ghost" block onclick={() => updateProjectStatus('completed')} disabled={statusSaving}>
							Mark Complete
						</Button>
						<Button variant="ghost" block onclick={() => updateProjectStatus('archived')} disabled={statusSaving}>
							Archive Project
						</Button>
					{:else}
						<Button variant="ghost" block onclick={() => updateProjectStatus('active')} disabled={statusSaving}>
							Reactivate Project
						</Button>
					{/if}
					<Button variant="ghost" block href="/dashboard/job-sites/{jobSiteState.id}/log">
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
							<polyline points="14 2 14 8 20 8"></polyline>
						</svg>
						Today's Log
					</Button>
					<Button block onclick={handleNewCalculation}>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<rect x="4" y="2" width="16" height="20" rx="2"></rect>
							<line x1="8" y1="6" x2="16" y2="6"></line>
							<line x1="8" y1="10" x2="16" y2="10"></line>
						</svg>
						Open Calculator
					</Button>
				</div>
			</Card>
		</aside>
	</div>
</div>

<style>
	.dashboard {
		width: 100%;
	}

	.desktop-layout {
		display: block;
	}

	.desktop-main {
		width: 100%;
	}

	.desktop-sidebar {
		display: none;
	}

	@media (min-width: 1024px) {
		.desktop-layout {
			display: grid;
			grid-template-columns: 3fr 2fr;
			gap: 24px;
			align-items: start;
		}

		.desktop-main {
			min-width: 0;
		}

		.desktop-sidebar {
			display: flex;
			flex-direction: column;
			gap: 16px;
			position: sticky;
			top: 20px;
		}
	}

	.sidebar-map {
		border-radius: var(--radius);
		overflow: hidden;
	}

	.map-loading {
		padding: 60px 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		background: var(--surface-alt);
	}

	.sidebar-stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-3, 12px);
		margin: 0;
	}

	.sidebar-actions {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.breadcrumb {
		margin-bottom: 16px;
	}

	.page-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: var(--sp-2, 8px);
	}

	.meta-location {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.header-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	@media (min-width: 1024px) {
		.header-actions {
			display: none;
		}
	}

	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 2px solid var(--border);
		margin-bottom: 24px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
		/* Hide the scrollbar chrome; the bar still scrolls on narrow screens. */
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.tabs::-webkit-scrollbar {
		display: none;
	}

	/* On wider screens all 5 tabs fit comfortably on one row; never wrap. */
	@media (min-width: 900px) {
		.tabs {
			flex-wrap: nowrap;
			overflow-x: visible;
		}
	}

	@media (min-width: 1024px) {
		.tabs {
			border-bottom: none;
			gap: 6px;
			margin-bottom: 20px;
		}
	}

	.tab {
		display: inline-flex;
		align-items: center;
		padding: 12px 18px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.2s, border-color 0.2s, background 0.2s;
		margin-bottom: -2px;
		min-height: 48px;
	}

	.tab:hover {
		color: var(--accent);
	}

	.tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	@media (min-width: 1024px) {
		.tab {
			border-bottom: none;
			border-radius: 999px;
			padding: 10px 16px;
			margin-bottom: 0;
			background: transparent;
		}

		.tab:hover {
			background: var(--surface-hover);
		}

		.tab.active {
			background: var(--accent);
			color: var(--accent-text);
			border-bottom-color: transparent;
		}
	}

	.tab-count {
		display: inline-block;
		margin-left: 6px;
		padding: 1px 7px;
		border-radius: 999px;
		background: var(--surface-alt);
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 700;
		vertical-align: middle;
	}

	.tab.active .tab-count {
		background: var(--accent);
		color: var(--accent-text);
	}

	@media (min-width: 1024px) {
		.tab.active .tab-count {
			background: rgba(255, 255, 255, 0.25);
			color: var(--accent-text);
		}
	}

	@media (max-width: 640px) {
		.header-actions {
			width: 100%;
		}

		.header-actions :global(.btn) {
			flex: 1;
		}
	}
</style>

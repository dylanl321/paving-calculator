<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import type { PageData } from './$types';
	import './_components/job-site.css';
	import {
		roadTypeLabels,
		scopeOfWorkLabels,
		tackTypeLabels,
		type ConfigForm
	} from './_components/shared';
	import OverviewTab from './_components/OverviewTab.svelte';
	import ConfigurationTab from './_components/ConfigurationTab.svelte';
	import EquipmentTab from './_components/EquipmentTab.svelte';
	import CalculationsTab from './_components/CalculationsTab.svelte';
	import DailyLogTab from './_components/DailyLogTab.svelte';
	import WorkZonesTab from './_components/WorkZonesTab.svelte';
	import ScheduleTab from './_components/ScheduleTab.svelte';
	import { haversineFeet } from '$lib/services/mapUtils';
	import FeatureDiscovery from '$lib/components/FeatureDiscovery.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';

	let { data }: { data: PageData } = $props();

	let activeTab = $state('overview');

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
		num_lifts: data.config?.num_lifts || null,
		total_tonnage: data.config?.total_tonnage || null,
		cost_per_ton: data.config?.cost_per_ton || null,
		cost_per_sy: data.config?.cost_per_sy || null,
		cost_per_mile: data.config?.cost_per_mile || null,
		total_contract_value: data.config?.total_contract_value || null
	});

	let equipmentList = $state([...data.equipment]);
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

	function handleNewCalculation() {
		goto(`/?job_site_id=${data.jobSite.id}`);
	}

	const roadTypeLabel = $derived(
		configForm.road_type ? roadTypeLabels[configForm.road_type] : null
	);
	const scopeLabel = $derived(
		configForm.scope_of_work ? scopeOfWorkLabels[configForm.scope_of_work] : null
	);
	const tackLabel = $derived(configForm.tack_type ? tackTypeLabels[configForm.tack_type] : null);

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

	const configComplete = $derived(
		Boolean(
			configForm.road_type &&
				configForm.total_length_ft &&
				configForm.num_lanes &&
				configForm.mix_type &&
				configForm.target_spread_rate
		)
	);

	// Route-derived length (feet) along the drawn waypoints; falls back to the
	// configured total length when no route is drawn.
	const routeLengthFt = $derived.by(() => {
		const wps = data.routeWaypoints;
		if (wps && wps.length >= 2) {
			let ft = 0;
			for (let i = 0; i < wps.length - 1; i++) {
				ft += haversineFeet(wps[i].lat, wps[i].lng, wps[i + 1].lat, wps[i + 1].lng);
			}
			return ft;
		}
		return configForm.total_length_ft ?? null;
	});
</script>

<svelte:head>
	<title>{data.jobSite.name} — {config.app.name}</title>
</svelte:head>

<div class="dashboard job-site-page">
	<div class="breadcrumb">
		<a href="/dashboard">Projects</a>
		<svg
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="9 18 15 12 9 6"></polyline>
		</svg>
		<span>Project</span>
	</div>

	<div class="page-header">
		<div class="page-header-main">
			<h2 class="page-title">{data.jobSite.name}</h2>
			<div class="page-meta">
				<span class="status-badge status-{data.jobSite.status.toLowerCase()}">
					{data.jobSite.status}
				</span>
				{#if data.jobSite.location_description}
					<span class="meta-location">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
							<circle cx="12" cy="10" r="3"></circle>
						</svg>
						{data.jobSite.location_description}
					</span>
				{/if}
			</div>
		</div>
		<div class="page-actions">
			<a class="btn-ghost-action" href="/dashboard/job-sites/{data.jobSite.id}/log">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
				</svg>
				Today's Log
			</a>
			<button class="btn-primary" onclick={handleNewCalculation}>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<rect x="4" y="2" width="16" height="20" rx="2"></rect>
					<line x1="8" y1="6" x2="16" y2="6"></line>
					<line x1="8" y1="10" x2="16" y2="10"></line>
				</svg>
				Open Calculator
			</button>
		</div>
	</div>

	<nav class="tabs">
		<button class="tab" class:active={activeTab === 'overview'} onclick={() => (activeTab = 'overview')}>
			Overview
		</button>
		<button
			class="tab"
			class:active={activeTab === 'daily_log'}
			onclick={() => (activeTab = 'daily_log')}
		>
			Daily Log
		</button>
		<button
			class="tab"
			class:active={activeTab === 'milestones'}
			onclick={() => (activeTab = 'milestones')}
		>
			Schedule
		</button>
		<button
			class="tab"
			class:active={activeTab === 'configuration'}
			onclick={() => (activeTab = 'configuration')}
		>
			Configuration
		</button>
		<button
			class="tab"
			class:active={activeTab === 'equipment'}
			onclick={() => (activeTab = 'equipment')}
		>
			Equipment{#if equipmentList.length}<span class="tab-count">{equipmentList.length}</span>{/if}
		</button>
		<button
			class="tab"
			class:active={activeTab === 'work_zones'}
			onclick={() => (activeTab = 'work_zones')}
		>
			Work Zones
		</button>
		<button
			class="tab"
			class:active={activeTab === 'calculations'}
			onclick={() => (activeTab = 'calculations')}
		>
			Calculations{#if data.calculations.length}<span class="tab-count">{data.calculations.length}</span>{/if}
		</button>
	</nav>

	{#if activeTab === 'overview'}
		<FeatureDiscovery
			feature="route"
			condition={!data.routeWaypoints || data.routeWaypoints.length === 0}
		/>

		<OverviewTab
			{data}
			{configForm}
			{totalAreaSqYd}
			{estTonnage}
			{estCostByTon}
			{estCostBySY}
			{estCostByMile}
			{costSummary}
			{configComplete}
			{milestonePct}
			equipmentCount={equipmentList.length}
			{roadTypeLabel}
			{scopeLabel}
			{tackLabel}
			onGoToTab={(tab) => (activeTab = tab)}
		/>
	{:else if activeTab === 'configuration'}
		<ConfigurationTab jobSiteId={data.jobSite.id} bind:configForm {estTonnage} />
	{:else if activeTab === 'equipment'}
		<EquipmentTab jobSiteId={data.jobSite.id} bind:equipmentList />
	{:else if activeTab === 'calculations'}
		<CalculationsTab calculations={data.calculations} onNewCalculation={handleNewCalculation} />
	{:else if activeTab === 'daily_log'}
		<DailyLogTab jobSiteId={data.jobSite.id} />
	{:else if activeTab === 'work_zones'}
		<WorkZonesTab
			jobSite={data.jobSite}
			routeWaypoints={data.routeWaypoints}
			numLanes={configForm.num_lanes}
			totalLengthFt={routeLengthFt}
			onGoToOverview={() => (activeTab = 'overview')}
		/>
	{:else if activeTab === 'milestones'}
		<ScheduleTab jobSiteId={data.jobSite.id} bind:milestones />
	{/if}
</div>

<style>
	.dashboard {
		width: 100%;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.85rem;
		color: var(--text-muted);
		margin-bottom: 16px;
	}

	.breadcrumb a {
		color: var(--text-muted);
		transition: color 0.2s;
	}

	.breadcrumb a:hover {
		color: var(--accent);
	}

	.breadcrumb svg {
		width: 14px;
		height: 14px;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}

	.page-header-main {
		min-width: 0;
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 8px;
	}

	.page-meta {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.meta-location {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.page-actions {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.btn-ghost-action {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 16px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
		transition: border-color 0.2s, color 0.2s;
	}

	.btn-ghost-action:hover {
		border-color: var(--accent);
		color: var(--accent);
	}

	.status-badge {
		padding: 6px 12px;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}

	.status-active {
		background: var(--good);
		color: var(--accent-text);
	}

	.status-completed {
		background: var(--text-muted);
		color: var(--bg);
	}

	.status-archived {
		background: var(--surface-hover);
		color: var(--text-muted);
	}

	.tabs {
		display: flex;
		gap: 4px;
		border-bottom: 2px solid var(--border);
		margin-bottom: 24px;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.tab {
		padding: 12px 20px;
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.2s, border-color 0.2s;
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

	@media (max-width: 640px) {
		.page-actions {
			width: 100%;
		}

		.page-actions .btn-primary,
		.page-actions .btn-ghost-action {
			flex: 1;
			justify-content: center;
		}
	}
</style>

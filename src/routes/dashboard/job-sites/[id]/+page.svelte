<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import type { PageData } from './$types';
	import { MapPin } from 'lucide-svelte';
	import LoadTracker from '$lib/components/LoadTracker.svelte';
	import TruckQueue from '$lib/components/TruckQueue.svelte';
	import SpreadRateHistogram from '$lib/components/SpreadRateHistogram.svelte';
	import WasteYieldAnalysis from '$lib/components/WasteYieldAnalysis.svelte';
	import ETACalculator from '$lib/components/ETACalculator.svelte';
	import JobSiteLocationPicker from '$lib/components/JobSiteLocationPicker.svelte';
	import { spreadToleranceFor } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';

	let { data }: { data: PageData } = $props();

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
	interface EquipmentItem {
		id: string;
		equipment_type: string;
		name: string;
		capacity?: string | null;
		notes?: string | null;
	}
	interface EquipmentResponse {
		equipment: EquipmentItem;
	}
	interface MilestoneItem {
		id: string;
		name: string;
		description?: string | null;
		status: 'pending' | 'in_progress' | 'completed';
		target_date?: string | null;
	}
	interface MilestoneResponse {
		milestone: MilestoneItem;
	}

	let activeTab = $state('overview');

	// Location / coordinates state — driven by JobSiteLocationPicker
	let pickerLat = $state<number | null>(data.jobSite.latitude ?? null);
	let pickerLng = $state<number | null>(data.jobSite.longitude ?? null);
	let locationSaving = $state(false);
	let showLocationSearch = $state(false);

	// Plant location state (stored in localStorage)
	let plantForm = $state({
		name: '',
		latitude: null as number | null,
		longitude: null as number | null
	});
	let plantSaved = $state(false);

	// Load plant location from localStorage
	function loadPlantLocation() {
		if (typeof localStorage === 'undefined') return { name: '', latitude: null, longitude: null };
		const key = `plant_${data.jobSite.id}`;
		const stored = localStorage.getItem(key);
		if (!stored) return { name: '', latitude: null, longitude: null };
		try {
			return JSON.parse(stored);
		} catch {
			return { name: '', latitude: null, longitude: null };
		}
	}

	let plantLocation = $state(loadPlantLocation());

	function savePlantLocation() {
		if (typeof localStorage === 'undefined') return;
		const key = `plant_${data.jobSite.id}`;
		const location = {
			name: plantForm.name,
			latitude: plantForm.latitude,
			longitude: plantForm.longitude
		};
		localStorage.setItem(key, JSON.stringify(location));
		plantLocation = location;
		plantSaved = true;
		setTimeout(() => {
			plantSaved = false;
		}, 2000);
	}

	function clearPlantLocation() {
		if (typeof localStorage === 'undefined') return;
		const key = `plant_${data.jobSite.id}`;
		localStorage.removeItem(key);
		plantLocation = { name: '', latitude: null, longitude: null };
		plantForm = { name: '', latitude: null, longitude: null };
	}

	async function handleLocationChange(lat: number | null, lng: number | null) {
		locationSaving = true;
		try {
			await fetch(`/api/job-sites/${data.jobSite.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ latitude: lat, longitude: lng }),
				credentials: 'include'
			});
			// Reload to reflect updated coords throughout the page
			goto(`/dashboard/job-sites/${data.jobSite.id}`);
		} catch {
			// ignore
		} finally {
			locationSaving = false;
		}
	}

	async function clearCoordinates() {
		await handleLocationChange(null, null);
	}
	let configForm = $state({
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
	let newEquipment = $state({
		equipment_type: 'paver' as const,
		name: '',
		capacity: '',
		notes: ''
	});

	let saving = $state(false);

	// Milestones state
	let milestones = $state([...data.milestones]);
	let milestoneForm = $state({
		name: '',
		description: '',
		status: 'pending' as 'pending' | 'in_progress' | 'completed',
		target_date: ''
	});
	let showMilestoneForm = $state(false);
	let editingMilestone = $state<any | null>(null);
	let milestoneSaving = $state(false);

	// Photos state
	let photos = $state<any[]>([]);
	let selectedPhoto = $state<any | null>(null);

	async function loadPhotos() {
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/photos`);
			if (!res.ok) return;
			const result = (await res.json()) as PhotosResponse;
			photos = result.photos ?? [];
			renderPhotoGrid();
		} catch {
			// ignore
		}
	}

	function renderPhotoGrid() {
		const grid = document.getElementById('photo-grid');
		if (!grid) return;

		if (photos.length === 0) {
			grid.innerHTML = '<div class="empty-state-mini"><p>No photos yet</p></div>';
			return;
		}

		grid.innerHTML = photos
			.map(
				(photo) => `
			<div class="photo-thumb" data-photo-id="${photo.id}">
				<img src="/api/job-sites/${data.jobSite.id}/photos/${photo.id}/view" alt="${photo.caption || photo.filename}" />
				${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
			</div>
		`
			)
			.join('');

		// Add click handlers
		grid.querySelectorAll('.photo-thumb').forEach((el) => {
			el.addEventListener('click', () => {
				const photoId = el.getAttribute('data-photo-id');
				const photo = photos.find((p) => p.id === photoId);
				if (photo) openLightbox(photo);
			});
		});
	}

	function openLightbox(photo: any) {
		selectedPhoto = photo;
	}

	function closeLightbox() {
		selectedPhoto = null;
	}

	const roadTypeLabels: Record<string, string> = {
		highway: 'Highway',
		state_route: 'State Route',
		county_road: 'County Road',
		city_street: 'City Street',
		subdivision: 'Subdivision',
		parking_lot: 'Parking Lot',
		other: 'Other'
	};

	const scopeOfWorkLabels: Record<string, string> = {
		full_depth: 'Full Depth',
		mill_and_fill: 'Mill & Fill',
		overlay: 'Overlay',
		leveling: 'Leveling',
		patching: 'Patching',
		widening: 'Widening'
	};

	const tackTypeLabels: Record<string, string> = {
		anionic: 'Anionic',
		cationic: 'Cationic',
		polymer_modified: 'Polymer Modified',
		trackless: 'Trackless'
	};

	const equipmentTypeLabels: Record<string, string> = {
		paver: 'Paver',
		shuttle_buggy: 'Shuttle Buggy',
		roller_breakdown: 'Breakdown Roller',
		roller_intermediate: 'Intermediate Roller',
		roller_finish: 'Finish Roller',
		distributor: 'Distributor',
		milling_machine: 'Milling Machine',
		other: 'Other'
	};

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

	async function saveConfig() {
		saving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(configForm)
			});

			if (!res.ok) throw new Error('Failed to save');
		} catch (err) {
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function addEquipment() {
		if (!newEquipment.name) return;

		saving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/equipment`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(newEquipment)
			});

			if (!res.ok) throw new Error('Failed to add equipment');

			const { equipment } = (await res.json()) as EquipmentResponse;
			equipmentList = [...equipmentList, equipment];

			newEquipment = {
				equipment_type: 'paver',
				name: '',
				capacity: '',
				notes: ''
			};
		} catch (err) {
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function removeEquipment(equipId: string) {
		saving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/equipment/${equipId}`, {
				method: 'DELETE',
				credentials: 'include'
			});

			if (!res.ok) throw new Error('Failed to remove equipment');

			equipmentList = equipmentList.filter((e) => e.id !== equipId);
		} catch (err) {
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function createMilestone() {
		if (!milestoneForm.name) return;

		milestoneSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/milestones`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(milestoneForm)
			});

			if (!res.ok) throw new Error('Failed to create milestone');

			const { milestone } = (await res.json()) as MilestoneResponse;
			milestones = [...milestones, milestone];

			milestoneForm = {
				name: '',
				description: '',
				status: 'pending',
				target_date: ''
			};
			showMilestoneForm = false;
		} catch (err) {
			console.error(err);
		} finally {
			milestoneSaving = false;
		}
	}

	async function updateMilestoneStatus(id: string, status: 'pending' | 'in_progress' | 'completed') {
		milestoneSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/milestones/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ status })
			});

			if (!res.ok) throw new Error('Failed to update milestone');

			const { milestone } = (await res.json()) as MilestoneResponse;
			milestones = milestones.map((m) => (m.id === id ? milestone : m));
		} catch (err) {
			console.error(err);
		} finally {
			milestoneSaving = false;
		}
	}

	async function deleteMilestone(id: string) {
		milestoneSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${data.jobSite.id}/milestones/${id}`, {
				method: 'DELETE',
				credentials: 'include'
			});

			if (!res.ok) throw new Error('Failed to delete milestone');

			milestones = milestones.filter((m) => m.id !== id);
		} catch (err) {
			console.error(err);
		} finally {
			milestoneSaving = false;
		}
	}

	function formatDate(timestamp: number): string {
		return new Date(timestamp * 1000).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function formatCalcType(type: string): string {
		const labels: Record<string, string> = {
			spread_rate: 'Spread Rate',
			feet_left: 'Feet Left',
			tonnage: 'Tonnage',
			tack_rate: 'Tack Rate',
			stick_check: 'Stick Check'
		};
		return labels[type] || type;
	}

	function getResultSummary(calc: any): string {
		switch (calc.calc_type) {
			case 'spread_rate':
				return `${calc.result.lbsPerSqYd?.toFixed(1) || '—'} lbs/yd²`;
			case 'feet_left':
				return `${calc.result.feetRemaining?.toFixed(0) || '—'} ft remaining`;
			case 'tonnage':
				return `${calc.result.tonsRequired?.toFixed(1) || '—'} tons`;
			case 'tack_rate':
				return `${calc.result.gallonsPerSqYd?.toFixed(3) || '—'} gal/yd²`;
			case 'stick_check':
				return `${calc.result.stickReading?.toFixed(2) || '—'} in`;
			default:
				return '—';
		}
	}

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

	function fmt(n: number, digits = 0): string {
		return n.toLocaleString('en-US', {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		});
	}

	function fmtDollars(v: number): string {
		return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
</script>

<svelte:head>
	<title>{data.jobSite.name} — {config.app.name}</title>
</svelte:head>

<div class="dashboard">
	<div class="breadcrumb">
		<a href="/dashboard">Dashboard</a>
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
		<span>Job Site</span>
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
			class:active={activeTab === 'calculations'}
			onclick={() => (activeTab = 'calculations')}
		>
			Calculations{#if data.calculations.length}<span class="tab-count">{data.calculations.length}</span>{/if}
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
			Milestones
		</button>
		<button
			class="tab"
			class:active={activeTab === 'work_zones'}
			onclick={() => (activeTab = 'work_zones')}
		>
			Work Zones
		</button>
	</nav>

	{#if activeTab === 'overview'}
		{#if !configComplete}
			<div class="setup-banner">
				<div class="setup-banner-text">
					<strong>Finish setting up this job</strong>
					<span>Add road geometry and paving targets so calculators and daily logs can check yield against spec.</span>
				</div>
				<button class="btn-primary" onclick={() => (activeTab = 'configuration')}>
					Complete Configuration
				</button>
			</div>
		{/if}

		<div class="overview-grid">
			<section class="panel panel-span">
				<div class="panel-head">
					<h3>Paving Targets</h3>
					<button class="link-btn" onclick={() => (activeTab = 'configuration')}>Edit</button>
				</div>
				<dl class="spec-list">
					<div class="spec-item">
						<dt>Mix Type</dt>
						<dd>{configForm.mix_type || '—'}</dd>
					</div>
					<div class="spec-item">
						<dt>Scope</dt>
						<dd>{scopeLabel || '—'}</dd>
					</div>
					<div class="spec-item">
						<dt>Target Thickness</dt>
						<dd>{configForm.target_thickness_in ? `${configForm.target_thickness_in} in` : '—'}</dd>
					</div>
					<div class="spec-item">
						<dt>Target Spread</dt>
						<dd>{configForm.target_spread_rate ? `${configForm.target_spread_rate} lbs/yd²` : '—'}</dd>
					</div>
					<div class="spec-item">
						<dt>Tack Coat</dt>
						<dd>{tackLabel || '—'}</dd>
					</div>
					<div class="spec-item">
						<dt>Target Tack</dt>
						<dd>{configForm.target_tack_rate ? `${configForm.target_tack_rate} gal/yd²` : '—'}</dd>
					</div>
				</dl>
			</section>

			<section class="panel">
				<div class="panel-head">
					<h3>Roadway</h3>
					<button class="link-btn" onclick={() => (activeTab = 'configuration')}>Edit</button>
				</div>
				<dl class="spec-list">
						<div class="spec-item">
							<dt>Road Type</dt>
							<dd>{roadTypeLabel || '—'}</dd>
						</div>
						<div class="spec-item">
							<dt>Length</dt>
							<dd>{configForm.total_length_ft ? `${fmt(configForm.total_length_ft)} ft` : '—'}</dd>
						</div>
						<div class="spec-item">
							<dt>Lanes × Width</dt>
							<dd>
								{configForm.num_lanes ?? '—'} × {configForm.lane_width_ft ? `${configForm.lane_width_ft} ft` : '—'}
							</dd>
						</div>
						<div class="spec-item">
							<dt>Lifts</dt>
							<dd>{configForm.num_lifts ?? '—'}</dd>
						</div>
						<div class="spec-item">
							<dt>Total Tonnage</dt>
							<dd>{configForm.total_tonnage ? `${fmt(configForm.total_tonnage, 1)} t` : (estTonnage ? `${fmt(estTonnage, 1)} t (est.)` : '—')}</dd>
						</div>
					</dl>
					<div class="derived-row">
						<div class="derived">
							<span class="derived-label">Total Area</span>
							<span class="derived-value">{totalAreaSqYd ? `${fmt(totalAreaSqYd)} yd²` : '—'}</span>
						</div>
						<div class="derived">
							<span class="derived-label">Est. Tonnage at Target</span>
							<span class="derived-value">{estTonnage ? `${fmt(estTonnage, 1)} t` : '—'}</span>
						</div>
					</div>
					{#if configForm.total_contract_value || estCostByTon || estCostBySY || estCostByMile}
						<div class="derived-row">
							{#if configForm.total_contract_value}
								<div class="derived">
									<span class="derived-label">Contract Value</span>
									<span class="derived-value">{fmtDollars(configForm.total_contract_value)}</span>
								</div>
							{/if}
							{#if estCostByTon}
								<div class="derived">
									<span class="derived-label">Est. Cost (by ton)</span>
									<span class="derived-value">{fmtDollars(estCostByTon)}</span>
								</div>
							{/if}
							{#if estCostBySY}
								<div class="derived">
									<span class="derived-label">Est. Cost (by area)</span>
									<span class="derived-value">{fmtDollars(estCostBySY)}</span>
								</div>
							{/if}
							{#if estCostByMile}
								<div class="derived">
									<span class="derived-label">Est. Cost (by mile)</span>
									<span class="derived-value">{fmtDollars(estCostByMile)}</span>
								</div>
							{/if}
						</div>
					{/if}
				</section>

				{#if configForm.cost_per_ton || configForm.cost_per_sy || configForm.cost_per_mile || configForm.total_contract_value}
					<section class="panel">
						<div class="panel-head">
							<h3>Cost Breakdown</h3>
							<button class="link-btn" onclick={() => (activeTab = 'configuration')}>Edit</button>
						</div>
						<dl class="spec-list">
							{#if configForm.cost_per_ton}
								<div class="spec-item">
									<dt>Cost per Ton</dt>
									<dd>{fmtDollars(configForm.cost_per_ton)}/ton</dd>
								</div>
							{/if}
							{#if configForm.cost_per_sy}
								<div class="spec-item">
									<dt>Cost per SY</dt>
									<dd>{fmtDollars(configForm.cost_per_sy)}/yd²</dd>
								</div>
							{/if}
							{#if configForm.cost_per_mile}
								<div class="spec-item">
									<dt>Cost per Mile</dt>
									<dd>{fmtDollars(configForm.cost_per_mile)}/mi</dd>
								</div>
							{/if}
							{#if configForm.total_contract_value}
								<div class="spec-item">
									<dt>Contract</dt>
									<dd>{fmtDollars(configForm.total_contract_value)}</dd>
								</div>
							{/if}
						</dl>
						{#if costSummary}
							<div class="derived-row">
								<div class="derived">
									<span class="derived-label">{costSummary.method}</span>
									<span class="derived-value">{fmtDollars(costSummary.value)}</span>
								</div>
								{#if costSummary.value && (configForm.total_tonnage || estTonnage)}
									<div class="derived">
										<span class="derived-label">$/ton (derived)</span>
										<span class="derived-value">{fmtDollars(costSummary.value / (configForm.total_tonnage || estTonnage || 1))}/t</span>
									</div>
								{/if}
								{#if costSummary.value && totalAreaSqYd}
									<div class="derived">
										<span class="derived-label">$/SY (derived)</span>
										<span class="derived-value">{fmtDollars(costSummary.value / totalAreaSqYd)}/yd²</span>
									</div>
								{/if}
								{#if costSummary.value && configForm.total_length_ft}
									<div class="derived">
										<span class="derived-label">$/mile (derived)</span>
										<span class="derived-value">{fmtDollars(costSummary.value / (configForm.total_length_ft / 5280))}/mi</span>
									</div>
								{/if}
							</div>
						{/if}
					</section>
				{/if}
		</div>

		<div class="link-tiles">
			<button class="link-tile" onclick={() => (activeTab = 'equipment')}>
				<span class="link-tile-count">{equipmentList.length}</span>
				<span class="link-tile-label">Equipment</span>
			</button>
			<button class="link-tile" onclick={() => (activeTab = 'calculations')}>
				<span class="link-tile-count">{data.calculations.length}</span>
				<span class="link-tile-label">Saved Calcs</span>
			</button>
			<button class="link-tile" onclick={() => (activeTab = 'overview')}>
				<span class="link-tile-count">{data.assignments.length}</span>
				<span class="link-tile-label">Crew</span>
			</button>
			<a class="link-tile" href="/dashboard/job-sites/{data.jobSite.id}/log/history">
				<span class="link-tile-count link-tile-arrow">→</span>
				<span class="link-tile-label">Log History</span>
			</a>
		</div>

		<section class="panel location-panel">
			<div class="panel-head">
				<h3>Location & Route</h3>
				{#if data.jobSite.latitude != null}
					<button class="link-btn" onclick={() => (showLocationSearch = !showLocationSearch)}>
						{showLocationSearch ? 'Cancel' : 'Change'}
					</button>
				{/if}
			</div>

			{#if data.jobSite.latitude != null && !showLocationSearch}
				{#await import('$lib/components/RouteAlignmentMap.svelte')}
					<div class="map-mini-loading">Loading map&hellip;</div>
				{:then { default: RouteAlignmentMap }}
					<RouteAlignmentMap
						site={{
							id: data.jobSite.id,
							name: data.jobSite.name,
							status: data.jobSite.status,
							latitude: data.jobSite.latitude,
							longitude: data.jobSite.longitude,
							location_description: data.jobSite.location_description
						}}
						initialWaypoints={data.routeWaypoints}
						numLanes={data.config?.num_lanes}
						laneWidthFt={data.config?.lane_width_ft}
						height="400px"
						onRouteSave={async (waypoints) => {
							await fetch(`/api/job-sites/${data.jobSite.id}/route`, {
								method: 'PUT',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ waypoints }),
								credentials: 'include'
							});
						}}
					/>
				{/await}
				<p class="location-coords">
					{data.jobSite.latitude.toFixed(5)}, {data.jobSite.longitude?.toFixed(5)}
					<button class="link-btn-sm" onclick={clearCoordinates}>Clear</button>
				</p>

				<div class="progress-map-section">
					<div class="progress-map-head">
						<h4>Haul Route</h4>
						<span class="progress-map-sub">Distance from asphalt plant to job site</span>
					</div>
					{#await import('$lib/components/HaulRouteMap.svelte')}
						<div class="map-mini-loading">Loading haul route&hellip;</div>
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
							<h5>Set Plant Location</h5>
							<div class="form-row">
								<div class="form-group">
									<label for="plant_name">Plant Name</label>
									<input
										type="text"
										id="plant_name"
										bind:value={plantForm.name}
										placeholder="e.g., Metro Asphalt Plant"
									/>
								</div>
							</div>
							<div class="form-row">
								<div class="form-group">
									<label for="plant_lat">Latitude</label>
									<input
										type="number"
										id="plant_lat"
										bind:value={plantForm.latitude}
										step="0.000001"
										placeholder="e.g., 39.7392"
									/>
								</div>
								<div class="form-group">
									<label for="plant_lng">Longitude</label>
									<input
										type="number"
										id="plant_lng"
										bind:value={plantForm.longitude}
										step="0.000001"
										placeholder="e.g., -104.9903"
									/>
								</div>
							</div>
							<button
								class="btn-primary"
								onclick={savePlantLocation}
								disabled={!plantForm.name || plantForm.latitude == null || plantForm.longitude == null}
							>
								Set Plant Location
							</button>
							{#if plantSaved}
								<div class="plant-saved">Plant location saved</div>
							{/if}
						</div>
					{:else}
						<div class="plant-info">
							<div class="plant-info-row">
								<span class="plant-info-label">Plant:</span>
								<span class="plant-info-value">{plantLocation.name}</span>
							</div>
							<div class="plant-info-row">
								<span class="plant-info-label">Location:</span>
								<span class="plant-info-value">{plantLocation.latitude?.toFixed(5)}, {plantLocation.longitude?.toFixed(5)}</span>
							</div>
							<button class="link-btn" onclick={clearPlantLocation}>Change Plant</button>
						</div>
					{/if}
				</div>

				{#if data.routeWaypoints.length >= 2}
					<div class="progress-map-section">
						<div class="progress-map-head">
							<h4>Paving Progress</h4>
							<span class="progress-map-sub">Completed segments shown in green</span>
						</div>
						{#await import('$lib/components/StationProgressMap.svelte')}
							<div class="map-mini-loading">Loading progress map&hellip;</div>
						{:then { default: StationProgressMap }}
							<StationProgressMap
								site={{
									id: data.jobSite.id,
									name: data.jobSite.name,
									status: data.jobSite.status,
									latitude: data.jobSite.latitude,
									longitude: data.jobSite.longitude,
									location_description: data.jobSite.location_description
								}}
								waypoints={data.routeWaypoints}
								numLanes={data.config?.num_lanes}
								laneWidthFt={data.config?.lane_width_ft}
								totalLengthFt={data.config?.total_length_ft}
								height="320px"
							/>
						{/await}
					</div>

					<div class="progress-map-section">
						<div class="progress-map-head">
							<h4>Spread Rate Map</h4>
							<span class="progress-map-sub">Color-coded by spread rate vs target</span>
						</div>
						{#await import('$lib/components/SpreadRateHeatMap.svelte')}
							<div class="map-mini-loading">Loading spread rate map&hellip;</div>
						{:then { default: SpreadRateHeatMap }}
							<SpreadRateHeatMap
								site={{
									id: data.jobSite.id,
									name: data.jobSite.name,
									status: data.jobSite.status,
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
					</div>
				{/if}

				{#if data.jobSite.latitude != null && data.jobSite.longitude != null}
					<div class="photos-section">
						<div class="photos-head">
							<h4>Field Photos</h4>
							{#await import('$lib/components/PhotoCapture.svelte')}
								<span class="loading-text">Loading...</span>
							{:then { default: PhotoCapture }}
								<PhotoCapture
									jobSiteId={data.jobSite.id}
									onUploaded={loadPhotos}
									compact={false}
								/>
							{/await}
						</div>

						{#await import('$lib/components/PhotoGeoMap.svelte')}
							<div class="map-mini-loading">Loading photo map&hellip;</div>
						{:then { default: PhotoGeoMap }}
							<PhotoGeoMap
								jobSiteId={data.jobSite.id}
								lat={data.jobSite.latitude}
								lng={data.jobSite.longitude}
								height="360px"
							/>
						{/await}

						<div class="photo-grid" id="photo-grid"></div>
					</div>
				{/if}
			{:else}
				<!-- Location picker: shown when no coords yet, or when "Change" is clicked -->
				<JobSiteLocationPicker
					bind:latitude={pickerLat}
					bind:longitude={pickerLng}
					onchange={handleLocationChange}
					mapHeight="280px"
					showMapEager={showLocationSearch}
				/>
				{#if locationSaving}
					<p class="location-saving">Saving&hellip;</p>
				{/if}
			{/if}
		</section>

		<LoadTracker jobSiteId={data.jobSite.id} isAuthenticated={!!data.user} numLanes={data.config?.num_lanes} targetTonnage={configForm.total_tonnage || estTonnage || null} />

		<WasteYieldAnalysis
			jobSiteId={data.jobSite.id}
			plannedTonnage={configForm.total_tonnage || estTonnage || null}
			isAuthenticated={!!data.user}
		/>

		<ETACalculator
			jobSiteId={data.jobSite.id}
			targetTonnage={configForm.total_tonnage || estTonnage || null}
			isAuthenticated={!!data.user}
			latitude={data.jobSite.latitude}
			longitude={data.jobSite.longitude}
		/>

		<TruckQueue jobSiteId={data.jobSite.id} isAuthenticated={!!data.user} />

		<SpreadRateHistogram
			jobSiteId={data.jobSite.id}
			targetRate={configForm.target_spread_rate}
			toleranceLbsSy={spreadToleranceFor(job.courseType).toleranceLbsSy}
		/>

		<section class="panel">
			<div class="panel-head">
				<h3>Assigned Crew</h3>
			</div>
			{#if data.assignments.length === 0}
				<div class="empty-state-mini">
					<p>No crew members assigned yet</p>
				</div>
			{:else}
				<div class="crew-list">
					{#each data.assignments as assignment}
						<div class="crew-card">
							<div class="crew-avatar">{assignment.user_name.charAt(0).toUpperCase()}</div>
							<div class="crew-info">
								<div class="crew-name">{assignment.user_name}</div>
								<div class="crew-role">{assignment.role}</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else if activeTab === 'configuration'}
		<section class="section">
			<h3>Road Details</h3>
			<form class="config-form" onchange={saveConfig}>
				<div class="form-group">
					<label for="road_type">Road Type</label>
					<div class="selector-grid">
						{#each Object.entries(roadTypeLabels) as [value, label]}
							<button
								type="button"
								class="selector-card"
								class:active={configForm.road_type === value}
								onclick={() => {
									configForm.road_type = value as any;
									saveConfig();
								}}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="num_lanes">Number of Lanes</label>
						<input
							type="number"
							id="num_lanes"
							bind:value={configForm.num_lanes}
							min="1"
							placeholder="e.g., 2"
						/>
					</div>

					<div class="form-group">
						<label for="lane_width_ft">Lane Width (ft)</label>
						<input
							type="number"
							id="lane_width_ft"
							bind:value={configForm.lane_width_ft}
							min="1"
							step="0.5"
							placeholder="e.g., 12"
						/>
					</div>
				</div>

				<div class="form-group">
					<label for="total_length_ft">Total Length (ft)</label>
					<input
						type="number"
						id="total_length_ft"
						bind:value={configForm.total_length_ft}
						min="1"
						placeholder="e.g., 5280"
					/>
				</div>

				<div class="form-group">
					<label for="num_lifts">Number of Lifts</label>
					<input
						type="number"
						id="num_lifts"
						bind:value={configForm.num_lifts}
						min="1"
						placeholder="e.g., 2"
					/>
				</div>

				<div class="form-group">
					<label for="total_tonnage">Total Estimated Tonnage</label>
					<input
						type="number"
						id="total_tonnage"
						bind:value={configForm.total_tonnage}
						min="0"
						step="1"
						placeholder="Auto-calculated or enter manually"
					/>
					{#if estTonnage}
						<div class="hint-text">Auto-calculated: {fmt(estTonnage, 1)} tons</div>
					{/if}
				</div>

				<h3 class="form-section-title">Contract Costs</h3>

				<div class="form-group">
					<label for="cost_per_ton">Cost per Ton ($/ton)</label>
					<input
						type="number"
						id="cost_per_ton"
						bind:value={configForm.cost_per_ton}
						min="0"
						step="0.01"
						placeholder="e.g., 85.00"
						onchange={() => saveConfig()}
					/>
				</div>

				<div class="form-group">
					<label for="cost_per_sy">Cost per SY ($/yd²)</label>
					<input
						type="number"
						id="cost_per_sy"
						bind:value={configForm.cost_per_sy}
						min="0"
						step="0.01"
						placeholder="e.g., 12.50"
						onchange={() => saveConfig()}
					/>
				</div>

				<div class="form-group">
					<label for="cost_per_mile">Cost per Mile ($/mile)</label>
					<input
						type="number"
						id="cost_per_mile"
						bind:value={configForm.cost_per_mile}
						min="0"
						step="0.01"
						placeholder="e.g., 50000.00"
						onchange={() => saveConfig()}
					/>
				</div>

				<div class="form-group">
					<label for="total_contract_value">Total Contract Value ($)</label>
					<input
						type="number"
						id="total_contract_value"
						bind:value={configForm.total_contract_value}
						min="0"
						step="0.01"
						placeholder="e.g., 250000.00"
						onchange={() => saveConfig()}
					/>
				</div>

				<div class="form-group">
					<label for="scope_of_work">Scope of Work</label>
					<div class="selector-grid">
						{#each Object.entries(scopeOfWorkLabels) as [value, label]}
							<button
								type="button"
								class="selector-card"
								class:active={configForm.scope_of_work === value}
								onclick={() => {
									configForm.scope_of_work = value as any;
									saveConfig();
								}}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>

				<div class="form-group">
					<label for="mix_type">Mix Type</label>
					<select id="mix_type" bind:value={configForm.mix_type}>
						<option value={null}>Select mix type</option>
						<option value="12.5mm Superpave">12.5mm Superpave</option>
						<option value="9.5mm Superpave Type 1">9.5mm Superpave Type 1</option>
						<option value="9.5mm Superpave Type 2">9.5mm Superpave Type 2</option>
						<option value="4.75mm Superpave">4.75mm Superpave</option>
						<option value="Polymer Modified">Polymer Modified</option>
						<option value="SMA (Stone Matrix Asphalt)">SMA (Stone Matrix Asphalt)</option>
						<option value="Other">Other</option>
					</select>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="target_thickness_in">Target Thickness (in)</label>
						<input
							type="number"
							id="target_thickness_in"
							bind:value={configForm.target_thickness_in}
							min="0"
							step="0.25"
							placeholder="e.g., 2"
						/>
					</div>

					<div class="form-group">
						<label for="target_spread_rate">Target Spread Rate (lbs/yd²)</label>
						<input
							type="number"
							id="target_spread_rate"
							bind:value={configForm.target_spread_rate}
							min="0"
							placeholder="Auto-calculated"
						/>
					</div>
				</div>

				<div class="form-group">
					<label for="tack_type">Tack Coat Type</label>
					<div class="selector-grid">
						{#each Object.entries(tackTypeLabels) as [value, label]}
							<button
								type="button"
								class="selector-card"
								class:active={configForm.tack_type === value}
								onclick={() => {
									configForm.tack_type = value as any;
									saveConfig();
								}}
							>
								{label}
							</button>
						{/each}
					</div>
				</div>

				<div class="form-group">
					<label for="target_tack_rate">Target Tack Rate (gal/yd²)</label>
					<input
						type="number"
						id="target_tack_rate"
						bind:value={configForm.target_tack_rate}
						min="0"
						step="0.01"
						placeholder="e.g., 0.06"
					/>
				</div>

				<div class="form-group">
					<label for="notes">Notes</label>
					<textarea
						id="notes"
						bind:value={configForm.notes}
						rows="4"
						placeholder="Additional notes about this job site..."
					></textarea>
				</div>

			</form>
		</section>
	{:else if activeTab === 'equipment'}
		<section class="section">
			<h3>Equipment List</h3>

			{#if equipmentList.length === 0}
				<div class="empty-state-mini">
					<p>No equipment assigned yet</p>
				</div>
			{:else}
				<div class="equipment-list">
					{#each equipmentList as equip}
						<div class="equipment-card">
							<div class="equipment-icon">
								<svg
									width="20"
									height="20"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
								</svg>
							</div>
							<div class="equipment-info">
								<div class="equipment-type">{equipmentTypeLabels[equip.equipment_type]}</div>
								<div class="equipment-name">{equip.name}</div>
								{#if equip.capacity}
									<div class="equipment-capacity">{equip.capacity}</div>
								{/if}
							</div>
							<button
								class="btn-remove"
								onclick={() => removeEquipment(equip.id)}
								disabled={saving}
								aria-label="Remove equipment"
							>
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								>
									<line x1="18" y1="6" x2="6" y2="18"></line>
									<line x1="6" y1="6" x2="18" y2="18"></line>
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<div class="add-equipment-form">
				<h4>Add Equipment</h4>
				<div class="form-row">
					<div class="form-group">
						<label for="equip_type">Type</label>
						<select id="equip_type" bind:value={newEquipment.equipment_type}>
							{#each Object.entries(equipmentTypeLabels) as [value, label]}
								<option value={value}>{label}</option>
							{/each}
						</select>
					</div>

					<div class="form-group">
						<label for="equip_name">Name</label>
						<input
							type="text"
							id="equip_name"
							bind:value={newEquipment.name}
							placeholder="e.g., CAT AP1055F"
						/>
					</div>
				</div>

				<div class="form-group">
					<label for="equip_capacity">Capacity (optional)</label>
					<input
						type="text"
						id="equip_capacity"
						bind:value={newEquipment.capacity}
						placeholder="e.g., 18.5 tons"
					/>
				</div>

				<button
					class="btn-primary"
					onclick={addEquipment}
					disabled={!newEquipment.name || saving}
				>
					Add Equipment
				</button>
			</div>
		</section>
	{:else if activeTab === 'calculations'}
		<section class="section">
			<div class="section-header">
				<h3>Saved Calculations</h3>
				<button class="btn-primary" onclick={handleNewCalculation}>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="12" y1="5" x2="12" y2="19"></line>
						<line x1="5" y1="12" x2="19" y2="12"></line>
					</svg>
					New Calculation
				</button>
			</div>

			{#if data.calculations.length === 0}
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
						<path
							d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
						></path>
					</svg>
					<h4>No calculations yet</h4>
					<p>Use the calculator to create and save calculations for this job site</p>
					<button class="btn-primary" style="margin-top: 16px;" onclick={handleNewCalculation}>
						Go to Calculator
					</button>
				</div>
			{:else}
				<div class="calc-list">
					{#each data.calculations as calc}
						<div class="calc-card">
							<div class="calc-header">
								<div class="calc-type-icon">
									<svg
										width="20"
										height="20"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<path
											d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
										></path>
									</svg>
								</div>
								<div class="calc-info">
									<h4 class="calc-type">{formatCalcType(calc.calc_type)}</h4>
									<p class="calc-date">{formatDate(calc.created_at)}</p>
								</div>
								<div class="calc-result">
									{getResultSummary(calc)}
								</div>
							</div>
							{#if calc.notes}
								<div class="calc-notes">{calc.notes}</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{:else if activeTab === 'daily_log'}
		<section class="section">
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
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
					<polyline points="14 2 14 8 20 8"></polyline>
					<line x1="16" y1="13" x2="8" y2="13"></line>
					<line x1="16" y1="17" x2="8" y2="17"></line>
					<polyline points="10 9 9 9 8 9"></polyline>
				</svg>
				<h4>Daily Production Log</h4>
				<p>Track tonnage, stations, conditions, and crew for each work day.</p>
				<div class="log-cta">
					<a class="btn-primary" href="/dashboard/job-sites/{data.jobSite.id}/log">Open today's log</a>
					<a class="btn btn-ghost" href="/dashboard/job-sites/{data.jobSite.id}/log/history">View history</a>
				</div>
			</div>
		</section>
	{:else if activeTab === 'work_zones'}
		<section class="section">
			{#if data.jobSite.latitude == null || data.jobSite.longitude == null}
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
					<button class="btn-primary" style="margin-top: 16px;" onclick={() => (activeTab = 'overview')}>
						Go to Overview
					</button>
				</div>
			{:else}
				{#await import('$lib/components/WorkZoneMap.svelte')}
					<div class="map-mini-loading">Loading work zones...</div>
				{:then { default: WorkZoneMap }}
					<WorkZoneMap
						orgId={data.jobSite.org_id}
						siteId={data.jobSite.id}
						lat={data.jobSite.latitude}
						lng={data.jobSite.longitude}
					/>
				{/await}
			{/if}
		</section>
	{:else if activeTab === 'milestones'}
		<section class="section">
			<div class="section-header">
				<h3>Project Milestones</h3>
				<button class="btn-primary" onclick={() => (showMilestoneForm = !showMilestoneForm)}>
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					>
						<line x1="12" y1="5" x2="12" y2="19"></line>
						<line x1="5" y1="12" x2="19" y2="12"></line>
					</svg>
					{showMilestoneForm ? 'Cancel' : 'Add Milestone'}
				</button>
			</div>

			{#if milestones.length > 0}
				<div class="milestone-progress">
					<div class="milestone-progress-header">
						<span class="milestone-progress-label">
							{milestones.filter((m) => m.status === 'completed').length} of {milestones.length} complete
						</span>
					</div>
					<div class="progress-bar">
						<div
							class="progress-fill"
							style="width: {(milestones.filter((m) => m.status === 'completed').length / milestones.length) * 100}%"
						></div>
					</div>
				</div>
			{/if}

			{#if showMilestoneForm}
				<div class="milestone-form">
					<div class="form-group">
						<label for="milestone_name">Name</label>
						<input
							type="text"
							id="milestone_name"
							bind:value={milestoneForm.name}
							placeholder="e.g., Base Layer Complete"
						/>
					</div>

					<div class="form-group">
						<label for="milestone_description">Description</label>
						<textarea
							id="milestone_description"
							bind:value={milestoneForm.description}
							rows="3"
							placeholder="Additional details..."
						></textarea>
					</div>

					<div class="form-row">
						<div class="form-group">
							<label for="milestone_status">Status</label>
							<select id="milestone_status" bind:value={milestoneForm.status}>
								<option value="pending">Pending</option>
								<option value="in_progress">In Progress</option>
								<option value="completed">Completed</option>
							</select>
						</div>

						<div class="form-group">
							<label for="milestone_target_date">Target Date</label>
							<input type="date" id="milestone_target_date" bind:value={milestoneForm.target_date} />
						</div>
					</div>

					<div class="form-actions">
						<button class="btn-primary" onclick={createMilestone} disabled={!milestoneForm.name || milestoneSaving}>
							Add Milestone
						</button>
						<button class="btn btn-ghost" onclick={() => (showMilestoneForm = false)}>Cancel</button>
					</div>
				</div>
			{/if}

			{#if milestones.length === 0}
				<div class="empty-state-mini">
					<p>No milestones yet. Add one to track project phases.</p>
				</div>
			{:else}
				<div class="milestone-list">
					{#each milestones as milestone (milestone.id)}
						<div class="milestone-card">
							<div class="milestone-header">
								<div class="milestone-status-badge status-{milestone.status}">
									<span class="status-dot"></span>
								</div>
								<div class="milestone-info">
									<h4 class="milestone-name">{milestone.name}</h4>
									{#if milestone.description}
										<p class="milestone-description">{milestone.description}</p>
									{/if}
									{#if milestone.target_date}
										<span class="milestone-date">
											Target: {new Date(milestone.target_date).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric',
												year: 'numeric'
											})}
										</span>
									{/if}
								</div>
							</div>
							<div class="milestone-actions">
								<select
									class="milestone-status-select"
									value={milestone.status}
									onchange={(e) => updateMilestoneStatus(milestone.id, e.currentTarget.value as any)}
									disabled={milestoneSaving}
								>
									<option value="pending">Pending</option>
									<option value="in_progress">In Progress</option>
									<option value="completed">Completed</option>
								</select>
								<button
									class="btn-remove"
									onclick={() => deleteMilestone(milestone.id)}
									disabled={milestoneSaving}
									aria-label="Delete milestone"
								>
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									>
										<line x1="18" y1="6" x2="6" y2="18"></line>
										<line x1="6" y1="6" x2="18" y2="18"></line>
									</svg>
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	{/if}
</div>

{#if selectedPhoto}
	<dialog class="lightbox" open onclick={closeLightbox}>
		<div class="lightbox-content" onclick={(e) => e.stopPropagation()}>
			<button type="button" class="lightbox-close" onclick={closeLightbox} aria-label="Close">
				<svg
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
			<img
				src="/api/job-sites/{data.jobSite.id}/photos/{selectedPhoto.id}/view"
				alt={selectedPhoto.caption || selectedPhoto.filename}
				class="lightbox-img"
			/>
			{#if selectedPhoto.caption}
				<div class="lightbox-caption">{selectedPhoto.caption}</div>
			{/if}
			<div class="lightbox-meta">
				{new Date(selectedPhoto.taken_at * 1000).toLocaleString()}
				{#if selectedPhoto.lat != null && selectedPhoto.lng != null}
					<span class="lightbox-gps">
						<MapPin size={14} style="display: inline-block; vertical-align: text-bottom;" /> {selectedPhoto.lat.toFixed(6)}, {selectedPhoto.lng.toFixed(6)}
					</span>
				{/if}
			</div>
		</div>
	</dialog>
{/if}

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

	.section {
		margin-bottom: 32px;
	}

	.section h3 {
		margin: 0 0 16px;
		font-size: 1.2rem;
	}

	.setup-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		background: var(--surface);
		border: 1px solid var(--accent);
		border-left-width: 4px;
		border-radius: var(--radius);
		padding: 16px 20px;
		margin-bottom: 24px;
	}

	.setup-banner-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.setup-banner-text strong {
		font-size: 0.95rem;
	}

	.setup-banner-text span {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.overview-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 16px;
		margin-bottom: 16px;
	}

	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.panel-span {
		grid-column: 1 / -1;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.panel-head h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.link-btn {
		background: transparent;
		border: none;
		color: var(--accent);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 6px;
	}

	.link-btn:hover {
		background: var(--surface-alt);
	}

	.spec-list {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 16px 20px;
		margin: 0;
	}

	.spec-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}

	.spec-item dt {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.spec-item dd {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		overflow-wrap: anywhere;
	}

	.derived-row {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		margin-top: 18px;
		padding-top: 16px;
		border-top: 1px solid var(--border);
	}

	.derived {
		flex: 1;
		min-width: 120px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.derived-label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.derived-value {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--accent);
	}

	.derived-highlight .derived-value {
		color: var(--success, #22c55e);
	}

	.form-section-divider {
		display: flex;
		align-items: center;
		gap: 12px;
		margin: 24px 0 12px;
		color: var(--text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.form-section-divider::before,
	.form-section-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}

	.form-hint {
		margin: 4px 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.project-totals {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 16px;
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.project-total-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.9rem;
	}

	.project-total-label {
		color: var(--text-muted);
	}

	.project-total-value {
		font-weight: 600;
		color: var(--text);
	}

	.project-total-grand {
		border-top: 1px solid var(--border);
		padding-top: 8px;
		margin-top: 4px;
	}

	.project-total-grand .project-total-label {
		color: var(--text);
		font-weight: 600;
	}

	.project-total-grand .project-total-value {
		color: var(--success, #22c55e);
		font-size: 1.1rem;
	}

	.link-tiles {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 12px;
		margin-bottom: 24px;
	}

	.link-tile {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 4px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		cursor: pointer;
		text-decoration: none;
		transition: border-color 0.2s, transform 0.1s;
		text-align: left;
	}

	.link-tile:hover {
		border-color: var(--accent);
		transform: translateY(-1px);
	}

	.link-tile-count {
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1;
	}

	.link-tile-arrow {
		color: var(--accent);
	}

	.link-tile-label {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.crew-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.crew-card {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
	}

	.crew-avatar {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 50%;
		font-weight: 700;
		font-size: 1.1rem;
	}

	.crew-info {
		flex: 1;
	}

	.crew-name {
		font-weight: 600;
		margin-bottom: 2px;
	}

	.crew-role {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.config-form {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.hint-text {
		font-size: 0.78rem;
		color: var(--text-muted);
		padding: 4px 0;
	}

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	input,
	select,
	textarea {
		padding: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.95rem;
		color: var(--text);
		min-height: 48px;
	}

	input:focus,
	select:focus,
	textarea:focus {
		outline: 2px solid var(--accent);
		outline-offset: 0;
	}

	textarea {
		resize: vertical;
		min-height: 100px;
	}

	.selector-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 8px;
	}

	.selector-card {
		padding: 12px;
		background: var(--surface);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		min-height: 48px;
	}

	.selector-card:hover {
		border-color: var(--accent);
	}

	.selector-card.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.equipment-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 24px;
	}

	.equipment-card {
		display: flex;
		align-items: center;
		gap: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
	}

	.equipment-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-alt);
		border-radius: 10px;
		color: var(--accent);
	}

	.equipment-info {
		flex: 1;
	}

	.equipment-type {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: 2px;
	}

	.equipment-name {
		font-weight: 600;
		margin-bottom: 2px;
	}

	.equipment-capacity {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.btn-remove {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-remove:hover:not(:disabled) {
		background: var(--warn);
		border-color: var(--warn);
		color: white;
	}

	.btn-remove:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.add-equipment-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
	}

	.add-equipment-form h4 {
		margin: 0 0 16px;
		font-size: 1rem;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 16px;
	}

	.section-header h3 {
		margin: 0;
		font-size: 1.2rem;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 16px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-state {
		text-align: center;
		padding: 48px 20px;
		color: var(--text-muted);
	}

	.empty-state svg {
		opacity: 0.5;
		margin-bottom: 16px;
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}

	.log-cta {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-top: 20px;
		flex-wrap: wrap;
	}
	.log-cta a {
		text-decoration: none;
	}

	.empty-state-mini {
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.empty-state-mini p {
		margin: 0;
		font-size: 0.9rem;
	}

	.calc-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.calc-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
	}

	.calc-header {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.calc-type-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-alt);
		border-radius: 10px;
		color: var(--accent);
	}

	.calc-info {
		flex: 1;
		min-width: 0;
	}

	.calc-type {
		margin: 0 0 2px;
		font-size: 1rem;
	}

	.calc-date {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.calc-result {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent);
		text-align: right;
	}

	.calc-notes {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	@media (max-width: 640px) {
		.form-row {
			grid-template-columns: 1fr;
		}

		.overview-grid {
			grid-template-columns: 1fr;
		}

		.link-tiles {
			grid-template-columns: repeat(2, 1fr);
		}

		.page-actions {
			width: 100%;
		}

		.page-actions .btn-primary,
		.page-actions .btn-ghost-action {
			flex: 1;
			justify-content: center;
		}
	}

	/* Location panel */
	.location-panel {
		margin-top: 16px;
	}

	.location-coords {
		margin: 8px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.link-btn-sm {
		background: none;
		border: 0;
		color: var(--accent);
		font-size: 0.75rem;
		text-decoration: underline;
		cursor: pointer;
		padding: 0;
		min-height: 32px;
	}

	.location-search {
		margin-top: 8px;
	}

	.location-input {
		width: 100%;
		min-height: 48px;
		padding: 0 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text);
		font-size: 0.95rem;
		box-sizing: border-box;
	}

	.location-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.location-hint {
		margin: 8px 0 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.location-results {
		list-style: none;
		margin: 8px 0 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
	}

	.location-result-btn {
		width: 100%;
		text-align: left;
		padding: 12px 14px;
		min-height: 48px;
		background: var(--surface);
		border: 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		font-size: 0.875rem;
		cursor: pointer;
	}

	.location-results li:last-child .location-result-btn {
		border-bottom: 0;
	}

	.location-result-btn:hover:not(:disabled) {
		background: var(--surface-hover, var(--surface-alt));
	}

	.location-result-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.location-saving {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.map-mini-loading {
		padding: 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.progress-map-section {
		margin-top: 20px;
	}

	.progress-map-head {
		display: flex;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 10px;
	}

	.progress-map-head h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.progress-map-sub {
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	/* Photos section */
	.photos-section {
		margin-top: 20px;
	}

	.photos-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 12px;
	}

	.photos-head h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text);
	}

	.loading-text {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.photo-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
		margin-top: 12px;
	}

	.photo-thumb {
		position: relative;
		aspect-ratio: 1;
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		border: 1px solid var(--border);
		transition: transform 0.15s;
	}

	.photo-thumb:hover {
		transform: scale(1.02);
	}

	.photo-thumb :global(img) {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	:global(.photo-caption) {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.8), transparent);
		color: white;
		font-size: 0.75rem;
		padding: 8px 6px 4px;
		line-height: 1.2;
	}

	/* Lightbox */
	.lightbox {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		border: none;
		padding: 20px;
		max-width: 100vw;
		max-height: 100vh;
	}

	.lightbox-content {
		position: relative;
		max-width: 90vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.lightbox-close {
		position: absolute;
		top: -40px;
		right: 0;
		background: transparent;
		border: none;
		color: white;
		cursor: pointer;
		padding: 8px;
		z-index: 1001;
		min-height: 40px;
		min-width: 40px;
	}

	.lightbox-close:hover {
		opacity: 0.7;
	}

	.lightbox-img {
		max-width: 100%;
		max-height: calc(90vh - 100px);
		object-fit: contain;
		border-radius: 8px;
	}

	.lightbox-caption {
		color: white;
		font-size: 1rem;
		margin-top: 12px;
		text-align: center;
		font-weight: 500;
	}

	.lightbox-meta {
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.875rem;
		margin-top: 8px;
		text-align: center;
		display: flex;
		gap: 16px;
		align-items: center;
	}

	.lightbox-gps {
		font-family: monospace;
	}

	/* Milestones */
	.milestone-progress {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 16px;
	}

	.milestone-progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.milestone-progress-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.progress-bar {
		height: 8px;
		background: var(--surface-alt);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.milestone-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.form-actions {
		display: flex;
		gap: 12px;
		margin-top: 16px;
	}

	.btn.btn-ghost {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 16px;
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.2s, color 0.2s;
	}

	.btn.btn-ghost:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.milestone-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.milestone-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
	}

	.milestone-header {
		flex: 1;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-width: 0;
	}

	.milestone-status-badge {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.milestone-status-badge.status-pending {
		background: rgba(128, 128, 128, 0.1);
	}

	.milestone-status-badge.status-in_progress {
		background: rgba(59, 130, 246, 0.1);
	}

	.milestone-status-badge.status-completed {
		background: rgba(34, 197, 94, 0.1);
	}

	.status-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.milestone-status-badge.status-pending .status-dot {
		background: var(--text-muted);
	}

	.milestone-status-badge.status-in_progress .status-dot {
		background: var(--warn);
	}

	.milestone-status-badge.status-completed .status-dot {
		background: var(--good);
	}

	.milestone-info {
		flex: 1;
		min-width: 0;
	}

	.milestone-name {
		margin: 0 0 4px;
		font-size: 1rem;
		font-weight: 600;
	}

	.milestone-description {
		margin: 0 0 4px;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.milestone-date {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.milestone-actions {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-shrink: 0;
	}

	.milestone-status-select {
		min-height: 40px;
		padding: 0 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
	}

	.milestone-status-select:focus {
		outline: 2px solid var(--accent);
		outline-offset: 0;
	}

	/* Plant location form */
	.plant-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		padding: 16px;
		margin-top: 12px;
	}

	.plant-form h5 {
		margin: 0 0 12px;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
	}

	.plant-saved {
		margin-top: 8px;
		padding: 8px;
		background: rgba(34, 197, 94, 0.1);
		color: var(--good, #22c55e);
		border-radius: var(--radius);
		font-size: 0.85rem;
		text-align: center;
	}

	.plant-info {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		padding: 12px 16px;
		margin-top: 12px;
	}

	.plant-info-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 6px;
	}

	.plant-info-row:last-child {
		margin-bottom: 8px;
	}

	.plant-info-label {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.plant-info-value {
		font-size: 0.85rem;
		color: var(--text);
	}

	@media (max-width: 768px) {
		.photo-grid {
			grid-template-columns: repeat(2, 1fr);
		}

		.milestone-card {
			flex-direction: column;
		}

		.milestone-actions {
			width: 100%;
			justify-content: space-between;
		}

		.milestone-status-select {
			flex: 1;
		}
	}
</style>

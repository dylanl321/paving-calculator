<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import { searchPlaces, type GeoResult } from '$lib/services/weather';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let activeTab = $state('overview');

	// Location / coordinates state
	let locationQuery = $state('');
	let locationResults = $state<GeoResult[]>([]);
	let locationSearching = $state(false);
	let locationSaving = $state(false);
	let locationSearchTimer: ReturnType<typeof setTimeout> | undefined;
	let showLocationSearch = $state(false);

	function onLocationInput() {
		clearTimeout(locationSearchTimer);
		if (locationQuery.trim().length < 2) {
			locationResults = [];
			return;
		}
		locationSearchTimer = setTimeout(async () => {
			locationSearching = true;
			try {
				locationResults = await searchPlaces(locationQuery);
			} catch {
				locationResults = [];
			} finally {
				locationSearching = false;
			}
		}, 300);
	}

	async function saveCoordinates(place: GeoResult) {
		locationSaving = true;
		locationResults = [];
		locationQuery = '';
		showLocationSearch = false;
		try {
			await fetch(`/api/job-sites/${data.jobSite.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ latitude: place.latitude, longitude: place.longitude }),
				credentials: 'include'
			});
			// Reload to get updated data
			goto(`/dashboard/job-sites/${data.jobSite.id}`);
		} catch {
			// ignore
		} finally {
			locationSaving = false;
		}
	}

	async function clearCoordinates() {
		await fetch(`/api/job-sites/${data.jobSite.id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ latitude: null, longitude: null }),
			credentials: 'include'
		});
		goto(`/dashboard/job-sites/${data.jobSite.id}`);
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
		notes: data.config?.notes || null
	});

	let equipmentList = $state([...data.equipment]);
	let newEquipment = $state({
		equipment_type: 'paver' as const,
		name: '',
		capacity: '',
		notes: ''
	});

	let saving = $state(false);

	const roadTypeLabels = {
		highway: 'Highway',
		state_route: 'State Route',
		county_road: 'County Road',
		city_street: 'City Street',
		subdivision: 'Subdivision',
		parking_lot: 'Parking Lot',
		other: 'Other'
	};

	const scopeOfWorkLabels = {
		full_depth: 'Full Depth',
		mill_and_fill: 'Mill & Fill',
		overlay: 'Overlay',
		leveling: 'Leveling',
		patching: 'Patching',
		widening: 'Widening'
	};

	const tackTypeLabels = {
		anionic: 'Anionic',
		cationic: 'Cationic',
		polymer_modified: 'Polymer Modified',
		trackless: 'Trackless'
	};

	const equipmentTypeLabels = {
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

			const { equipment } = await res.json();
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
			</section>
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
				<h3>Location</h3>
				{#if data.jobSite.latitude != null}
					<button class="link-btn" onclick={() => (showLocationSearch = !showLocationSearch)}>
						{showLocationSearch ? 'Cancel' : 'Change'}
					</button>
				{/if}
			</div>

			{#if data.jobSite.latitude != null && !showLocationSearch}
				{#await import('$lib/components/JobSiteMap.svelte')}
					<div class="map-mini-loading">Loading map&hellip;</div>
				{:then { default: JobSiteMap }}
					<JobSiteMap
						sites={[{
							id: data.jobSite.id,
							name: data.jobSite.name,
							status: data.jobSite.status,
							latitude: data.jobSite.latitude,
							longitude: data.jobSite.longitude,
							location_description: data.jobSite.location_description
						}]}
						height="220px"
					/>
				{/await}
				<p class="location-coords">
					{data.jobSite.latitude.toFixed(5)}, {data.jobSite.longitude?.toFixed(5)}
					<button class="link-btn-sm" onclick={clearCoordinates}>Clear</button>
				</p>
			{:else}
				{#if showLocationSearch || data.jobSite.latitude == null}
					<div class="location-search">
						<input
							type="search"
							class="location-input"
							placeholder="Search city or address&hellip;"
							bind:value={locationQuery}
							oninput={onLocationInput}
							autocomplete="off"
						/>
						{#if locationSearching}
							<p class="location-hint">Searching&hellip;</p>
						{:else if locationResults.length > 0}
							<ul class="location-results">
								{#each locationResults as place (place.latitude + ',' + place.longitude)}
									<li>
										<button
											type="button"
											class="location-result-btn"
											onclick={() => saveCoordinates(place)}
											disabled={locationSaving}
										>
											{place.name}{#if place.admin1}, {place.admin1}{/if}
											{#if place.country && place.country !== 'United States'}, {place.country}{/if}
										</button>
									</li>
								{/each}
							</ul>
						{:else if locationQuery.length >= 2}
							<p class="location-hint">No results found.</p>
						{:else if data.jobSite.latitude == null}
							<p class="location-hint">Set a map pin to show this site on the dashboard map.</p>
						{/if}
					</div>
				{/if}
			{/if}
		</section>

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

	.map-mini-loading {
		padding: 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>

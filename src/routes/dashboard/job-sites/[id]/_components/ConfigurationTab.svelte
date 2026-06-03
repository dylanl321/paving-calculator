<script lang="ts">
	import { roadTypeLabels, scopeOfWorkLabels, tackTypeLabels, fmt, type ConfigForm } from './shared';
	import AutoSaveStatus from '$lib/components/AutoSaveStatus.svelte';

	let {
		jobSiteId,
		configForm = $bindable(),
		estTonnage
	}: {
		jobSiteId: string;
		configForm: ConfigForm;
		estTonnage: number | null;
	} = $props();

	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	async function saveConfig() {
		saveStatus = 'saving';
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/config`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(configForm)
			});

			if (!res.ok) throw new Error('Failed to save');
			saveStatus = 'saved';
			setTimeout(() => {
				if (saveStatus === 'saved') saveStatus = 'idle';
			}, 2300);
		} catch (err) {
			console.error(err);
			saveStatus = 'error';
		}
	}
</script>

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

	<AutoSaveStatus status={saveStatus} onRetry={saveConfig} />
</section>

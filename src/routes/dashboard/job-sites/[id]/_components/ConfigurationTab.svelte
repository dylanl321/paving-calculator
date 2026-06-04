<script lang="ts">
	import { roadTypeLabels, scopeOfWorkLabels, tackTypeLabels, fmt, fmtDollars, type ConfigForm } from './shared';
	import AutoSaveStatus from '$lib/components/AutoSaveStatus.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import GdotPanel from '$lib/components/GdotPanel.svelte';
	import { browser } from '$app/environment';
	import { api } from '$lib/utils/api-error';

	let {
		jobSiteId,
		configForm = $bindable(),
		estTonnage,
		lat,
		lng
	}: {
		jobSiteId: string;
		configForm: ConfigForm;
		estTonnage: number | null;
		lat: number | null;
		lng: number | null;
	} = $props();

	let saveStatus = $state<'idle' | 'saving' | 'saved' | 'error'>('idle');

	interface Mix {
		id: string;
		mix_name: string;
		unit: string | null;
		bid_quantity: number | null;
		takeoff_tonnage: number | null;
		quantity_per_day: number | null;
		est_days: number | null;
		mix_type: string | null;
		target_thickness_in: number | null;
		target_spread_rate: number | null;
		tack_type: string | null;
		target_tack_rate: number | null;
		contract_unit_price: number | null;
		is_active: number;
		sort_order: number;
	}

	const MIX_TYPE_OPTIONS = [
		'12.5mm Superpave',
		'9.5mm Superpave Type 1',
		'9.5mm Superpave Type 2',
		'4.75mm Superpave',
		'Open Graded Interlayer (OGI)',
		'Polymer Modified',
		'SMA (Stone Matrix Asphalt)',
		'Patching',
		'Leveling',
		'Other'
	];

	let mixes = $state<Mix[]>([]);
	let mixesLoading = $state(true);

	$effect(() => {
		if (!browser) return;
		loadMixes();
	});

	async function loadMixes() {
		mixesLoading = true;
		try {
			const d = await api.get(`/api/job-sites/${jobSiteId}/mixes`) as { mixes?: Mix[] };
			mixes = d.mixes ?? [];
		} catch {
			// ignore
		} finally {
			mixesLoading = false;
		}
	}

	async function addMix() {
		try {
			const d = await api.post(`/api/job-sites/${jobSiteId}/mixes`, { mix_name: 'New Mix', unit: 'TN' }) as { mix?: Mix };
			if (d.mix) mixes = [...mixes, d.mix];
		} catch {
			// api.post shows error toast automatically
		}
	}

	let mixSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();

	function saveMix(mix: Mix) {
		const existing = mixSaveTimers.get(mix.id);
		if (existing) clearTimeout(existing);
		mixSaveTimers.set(
			mix.id,
			setTimeout(async () => {
				try {
					await api.put(`/api/job-sites/${jobSiteId}/mixes/${mix.id}`, {
						mix_name: mix.mix_name,
						unit: mix.unit,
						bid_quantity: mix.bid_quantity,
						takeoff_tonnage: mix.takeoff_tonnage,
						quantity_per_day: mix.quantity_per_day,
						est_days: mix.est_days,
						mix_type: mix.mix_type,
						target_thickness_in: mix.target_thickness_in,
						target_spread_rate: mix.target_spread_rate,
						tack_type: mix.tack_type,
						target_tack_rate: mix.target_tack_rate,
						contract_unit_price: mix.contract_unit_price
					});
				} catch {
					// api.put shows error toast automatically
				}
			}, 600)
		);
	}

	async function setActiveMix(mix: Mix) {
		try {
			const d = await api.put(`/api/job-sites/${jobSiteId}/mixes/${mix.id}`, {}) as { mixes?: Mix[] };
			mixes = d.mixes ?? mixes;
			toastStore.success(`${mix.mix_name} is now the active mix`);
		} catch {
			// api.put shows error toast automatically
		}
	}

	async function removeMix(mix: Mix) {
		try {
			await api.delete(`/api/job-sites/${jobSiteId}/mixes/${mix.id}`);
			await loadMixes();
		} catch {
			// api.delete shows error toast automatically
		}
	}

	const totalMixTonnage = $derived(
		mixes.reduce((sum, m) => sum + (m.takeoff_tonnage ?? 0), 0)
	);

	async function saveConfig() {
		saveStatus = 'saving';
		try {
			await api.put(`/api/job-sites/${jobSiteId}/config`, configForm);
			toastStore.success('Configuration saved');
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
	</form>
</section>

<section class="section">
	<div class="mixes-header">
		<div>
			<h3>Mixes &amp; Tonnage</h3>
			<p class="mixes-sub">
				Each mix carries its own type, tonnage and paving spec. "Allotted" is what the
				contract/state pays for; "Target" is our internal production goal. The active mix feeds the
				calculators and daily-log targets.
			</p>
		</div>
		<button type="button" class="btn btn-primary add-mix-btn" onclick={addMix}>+ Add Mix</button>
	</div>

	{#if mixesLoading}
		<div class="mixes-empty">Loading mixes…</div>
	{:else if mixes.length === 0}
		<div class="mixes-empty">
			<p>No mixes yet. Add a mix or import a project from a contract PDF.</p>
		</div>
	{:else}
		<div class="mix-cards">
			{#each mixes as mix (mix.id)}
				<div class="mix-card" class:active={mix.is_active === 1}>
					<div class="mix-card-head">
						<input
							class="mix-name-input"
							type="text"
							bind:value={mix.mix_name}
							oninput={() => saveMix(mix)}
							placeholder="Mix name"
						/>
						<div class="mix-card-actions">
							{#if mix.is_active === 1}
								<span class="active-badge">Active</span>
							{:else}
								<button type="button" class="mix-link" onclick={() => setActiveMix(mix)}>
									Set Active
								</button>
							{/if}
							<button
								type="button"
								class="mix-remove"
								onclick={() => removeMix(mix)}
								aria-label="Remove mix"
							>
								×
							</button>
						</div>
					</div>

					<div class="mix-fields">
						<div class="mix-field">
							<label>Mix Type</label>
							<select bind:value={mix.mix_type} onchange={() => saveMix(mix)}>
								<option value={null}>Select type</option>
								{#each MIX_TYPE_OPTIONS as opt}
									<option value={opt}>{opt}</option>
								{/each}
							</select>
						</div>
						<div class="mix-field">
							<label>Unit</label>
							<input type="text" bind:value={mix.unit} oninput={() => saveMix(mix)} placeholder="TN" />
						</div>
						<div class="mix-field allotted">
							<label>Allotted (Contract)</label>
							<input type="number" bind:value={mix.bid_quantity} oninput={() => saveMix(mix)} min="0" step="any" />
						</div>
						<div class="mix-field target">
							<label>Target (Our Goal)</label>
							<input type="number" bind:value={mix.takeoff_tonnage} oninput={() => saveMix(mix)} min="0" step="any" />
						</div>
						<div class="mix-field">
							<label>Qty / Day</label>
							<input type="number" bind:value={mix.quantity_per_day} oninput={() => saveMix(mix)} min="0" step="any" />
						</div>
						<div class="mix-field">
							<label>Est. Days</label>
							<input type="number" bind:value={mix.est_days} oninput={() => saveMix(mix)} min="0" step="0.5" />
						</div>
						<div class="mix-field">
							<label>Thickness (in)</label>
							<input type="number" bind:value={mix.target_thickness_in} oninput={() => saveMix(mix)} min="0" step="0.25" />
						</div>
						<div class="mix-field">
							<label>Spread (lbs/yd²)</label>
							<input type="number" bind:value={mix.target_spread_rate} oninput={() => saveMix(mix)} min="0" step="any" />
						</div>
						<div class="mix-field">
							<label>Tack Type</label>
							<select bind:value={mix.tack_type} onchange={() => saveMix(mix)}>
								<option value={null}>None</option>
								{#each Object.entries(tackTypeLabels) as [value, label]}
									<option value={value}>{label}</option>
								{/each}
							</select>
						</div>
						<div class="mix-field">
							<label>Tack Rate (gal/yd²)</label>
							<input type="number" bind:value={mix.target_tack_rate} oninput={() => saveMix(mix)} min="0" step="0.01" />
						</div>
						<div class="mix-field">
							<label>Contract Unit Price ($)</label>
							<input type="number" bind:value={mix.contract_unit_price} oninput={() => saveMix(mix)} min="0" step="0.01" />
						</div>
					</div>

					{#if mix.bid_quantity != null && mix.takeoff_tonnage != null}
						{@const variance = mix.takeoff_tonnage - mix.bid_quantity}
						{@const pct = mix.bid_quantity > 0 ? (variance / mix.bid_quantity) * 100 : null}
						<div class="mix-variance">
							{#if variance === 0}
								Target matches the contract quantity.
							{:else}
								Target is {fmt(Math.abs(variance), 1)} {mix.unit ?? ''}
								{variance < 0 ? 'below' : 'above'} the contract quantity{#if pct != null}
									({fmt(Math.abs(pct), 1)}%){/if}.
							{/if}
						</div>
					{/if}
					{#if mix.contract_unit_price != null && configForm.cost_per_ton != null && mix.is_active === 1}
						{@const margin = mix.contract_unit_price - configForm.cost_per_ton}
						<div class="mix-margin">
							Margin: contract {fmtDollars(mix.contract_unit_price)}/t − cost {fmtDollars(configForm.cost_per_ton)}/t =
							<strong>{fmtDollars(margin)}/t</strong>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="mix-total">
			<span>Total Target Tonnage (all mixes)</span>
			<strong>{fmt(totalMixTonnage, 1)} t</strong>
		</div>
	{/if}
</section>

<section class="section">
	<form class="config-form" onchange={saveConfig}>
		<h3 class="form-section-title">Route Designation</h3>

		<div class="form-group">
			<label for="route_designation">Route Designation</label>
			<input
				type="text"
				id="route_designation"
				bind:value={configForm.route_designation}
				placeholder="e.g. SR 400, I-85, CR 176"
			/>
		</div>

		<GdotPanel
			{jobSiteId}
			{lat}
			{lng}
			routeDesignation={configForm.route_designation}
			onRouteSelect={(routeId, roadName, county, district) => {
				configForm.route_designation = routeId;
				configForm.route_county = county;
				configForm.route_district = district;
				saveConfig();
			}}
		/>

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

<style>
	.mixes-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}

	.mixes-sub {
		margin: 4px 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		max-width: 60ch;
	}

	.add-mix-btn {
		white-space: nowrap;
	}

	.mixes-empty {
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
	}

	.mix-cards {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.mix-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		transition: border-color 0.2s;
	}

	.mix-card.active {
		border-color: var(--accent);
		border-left-width: 4px;
	}

	.mix-card-head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 14px;
	}

	.mix-name-input {
		flex: 1;
		font-size: 1rem;
		font-weight: 700;
		padding: 8px 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		min-width: 0;
	}

	.mix-card-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.active-badge {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--accent-text);
		background: var(--accent);
		padding: 4px 10px;
		border-radius: 999px;
	}

	.mix-link {
		background: none;
		border: none;
		color: var(--accent);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		text-decoration: underline;
		padding: 8px;
		min-height: 44px;
	}

	.mix-remove {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: 1.4rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 8px;
		min-height: 44px;
		min-width: 44px;
	}

	.mix-remove:hover {
		color: #ef4444;
	}

	.mix-fields {
		display: grid;
		grid-template-columns: 1fr;
		gap: 12px;
	}

	@media (min-width: 640px) {
		.mix-fields {
			grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		}
	}

	.mix-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.mix-field label {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		font-weight: 600;
	}

	.mix-field input,
	.mix-field select {
		padding: 8px 10px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		min-height: 44px;
	}

	.mix-field.allotted label {
		color: var(--text-muted);
	}

	.mix-field.target label {
		color: var(--accent);
	}

	.mix-variance {
		margin-top: 10px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.mix-margin {
		margin-top: 4px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.mix-margin strong {
		color: var(--accent);
	}

	.mix-total {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-top: 16px;
		padding: 12px 16px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.mix-total span {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		font-weight: 600;
	}

	.mix-total strong {
		font-size: 1.1rem;
		color: var(--accent);
	}
</style>

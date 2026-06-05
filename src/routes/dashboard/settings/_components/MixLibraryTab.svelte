<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';
	import type { OrgMixPreset } from './shared';

	type DbOrgMixPreset = OrgMixPreset;

	let { canEdit, initialPresets }: { canEdit: boolean; initialPresets: DbOrgMixPreset[] } = $props();

	// svelte-ignore state_referenced_locally
	let presets = $state<DbOrgMixPreset[]>(initialPresets ?? []);
	let showModal = $state(false);
	let saving = $state(false);
	let editingId = $state<string | null>(null);

	let formName = $state('');
	let formMixType = $state('');
	let formTargetThicknessIn = $state<number | null>(null);
	let formTargetSpreadRate = $state<number | null>(null);
	let formTackType = $state('');
	let formTargetTackRate = $state<number | null>(null);
	let formPlantSupplier = $state('');
	let formNotes = $state('');
	let formIsDefault = $state(false);
	let seedingGdot = $state(false);

	const mixTypeOptions = [
		{ value: '', label: '(blank)' },
		{ value: 'surface', label: 'Surface' },
		{ value: 'binder', label: 'Binder' },
		{ value: 'base', label: 'Base' },
		{ value: 'leveling', label: 'Leveling' },
		{ value: 'other', label: 'Other' }
	];

	async function loadPresets() {
		try {
			const data = await api.get<DbOrgMixPreset[]>('/api/org/mix-presets');
			presets = data;
		} catch (e) {
			console.error('Failed to load presets:', e);
		}
	}

	function openAddModal() {
		editingId = null;
		formName = '';
		formMixType = '';
		formTargetThicknessIn = null;
		formTargetSpreadRate = null;
		formTackType = '';
		formTargetTackRate = null;
		formPlantSupplier = '';
		formNotes = '';
		formIsDefault = false;
		showModal = true;
	}

	function openEditModal(preset: DbOrgMixPreset) {
		editingId = preset.id;
		formName = preset.name;
		formMixType = preset.mix_type ?? '';
		formTargetThicknessIn = preset.target_thickness_in;
		formTargetSpreadRate = preset.target_spread_rate;
		formTackType = preset.tack_type ?? '';
		formTargetTackRate = preset.target_tack_rate;
		formPlantSupplier = preset.plant_supplier ?? '';
		formNotes = preset.notes ?? '';
		formIsDefault = preset.is_default === 1;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editingId = null;
	}

	async function savePreset() {
		if (!formName.trim()) {
			toastStore.error('Name is required');
			return;
		}

		saving = true;
		try {
			const payload = {
				name: formName.trim(),
				mix_type: formMixType || null,
				target_thickness_in: formTargetThicknessIn,
				target_spread_rate: formTargetSpreadRate,
				tack_type: formTackType.trim() || null,
				target_tack_rate: formTargetTackRate,
				plant_supplier: formPlantSupplier.trim() || null,
				notes: formNotes.trim() || null,
				is_default: formIsDefault ? 1 : 0
			};

			if (editingId) {
				await api.put(`/api/org/mix-presets/${editingId}`, payload);
				toastStore.success('Preset updated successfully');
			} else {
				await api.post('/api/org/mix-presets', payload);
				toastStore.success('Preset created successfully');
			}

			closeModal();
			await loadPresets();
		} catch (e) {
			toastStore.error('Failed to save preset');
		} finally {
			saving = false;
		}
	}

	async function duplicatePreset(id: string) {
		try {
			await api.post(`/api/org/mix-presets/${id}/duplicate`, {});
			toastStore.success('Preset duplicated successfully');
			await loadPresets();
		} catch (e) {
			toastStore.error('Failed to duplicate preset');
		}
	}

	async function deletePreset(id: string, name: string) {
		if (!confirm(`Delete preset "${name}"?`)) return;
		try {
			await api.delete(`/api/org/mix-presets/${id}`);
			toastStore.success('Preset deleted successfully');
			await loadPresets();
		} catch (e) {
			toastStore.error('Failed to delete preset');
		}
	}

	async function seedGdot() {
		seedingGdot = true;
		try {
			const res = await fetch('/api/org/mix-presets/seed-gdot', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({})
			});

			if (res.status === 409) {
				const data = (await res.json()) as { error: string; count: number };
				if (data.error === 'org_has_presets') {
					const confirmed = confirm(
						`You already have ${data.count} preset${data.count === 1 ? '' : 's'}. Load GDOT defaults anyway?`
					);
					if (!confirmed) {
						seedingGdot = false;
						return;
					}

					// Retry with force
					const forceRes = await fetch('/api/org/mix-presets/seed-gdot', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ force: true })
					});

					if (!forceRes.ok) {
						throw new Error('Failed to seed GDOT defaults');
					}

					const forceData = (await forceRes.json()) as { seeded: number };
					toastStore.success(`GDOT defaults loaded (${forceData.seeded} mix types added)`);
					await loadPresets();
				}
			} else if (!res.ok) {
				throw new Error('Failed to seed GDOT defaults');
			} else {
				const data = (await res.json()) as { seeded: number };
				toastStore.success(`GDOT defaults loaded (${data.seeded} mix types added)`);
				await loadPresets();
			}
		} catch (e) {
			toastStore.error('Failed to load GDOT defaults');
		} finally {
			seedingGdot = false;
		}
	}
</script>

<section class="card">
	<h3>Mix Library</h3>
	<p class="card-desc">
		Manage your organization's mix presets for quick job setup.
	</p>

	{#if canEdit}
		<div class="btn-row">
			<button class="btn-add" onclick={openAddModal}>Add preset</button>
			<button class="btn-gdot" onclick={seedGdot} disabled={seedingGdot}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
					/>
				</svg>
				{seedingGdot ? 'Loading...' : 'Load GDOT Defaults'}
			</button>
		</div>
	{/if}

	{#if presets.length > 0}
		<div class="presets-list">
			{#each presets as preset (preset.id)}
				<div class="preset-card">
					<div class="preset-header">
						<div class="preset-title">
							<span class="preset-name">{preset.name}</span>
							{#if preset.is_default === 1}
								<span class="badge">Default</span>
							{/if}
						</div>
						{#if canEdit}
							<div class="preset-actions">
								<button
									class="action-btn"
									onclick={() => openEditModal(preset)}
									aria-label="Edit preset"
								>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
										/>
									</svg>
								</button>
								<button
									class="action-btn"
									onclick={() => duplicatePreset(preset.id)}
									aria-label="Duplicate preset"
								>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
								</button>
								<button
									class="action-btn danger"
									onclick={() => deletePreset(preset.id, preset.name)}
									aria-label="Delete preset"
								>
									<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								</button>
							</div>
						{/if}
					</div>
					<div class="preset-details">
						{#if preset.mix_type}
							<div class="detail-item">
								<span class="detail-label">Mix type:</span>
								<span class="detail-value">{preset.mix_type}</span>
							</div>
						{/if}
						{#if preset.target_thickness_in !== null}
							<div class="detail-item">
								<span class="detail-label">Target thickness:</span>
								<span class="detail-value">{preset.target_thickness_in}" </span>
							</div>
						{/if}
						{#if preset.target_spread_rate !== null}
							<div class="detail-item">
								<span class="detail-label">Target spread rate:</span>
								<span class="detail-value">{preset.target_spread_rate} lbs/SY</span>
							</div>
						{/if}
						{#if preset.tack_type}
							<div class="detail-item">
								<span class="detail-label">Tack type:</span>
								<span class="detail-value">{preset.tack_type}</span>
							</div>
						{/if}
						{#if preset.target_tack_rate !== null}
							<div class="detail-item">
								<span class="detail-label">Target tack rate:</span>
								<span class="detail-value">{preset.target_tack_rate} gal/SY</span>
							</div>
						{/if}
						{#if preset.plant_supplier}
							<div class="detail-item">
								<span class="detail-label">Plant / supplier:</span>
								<span class="detail-value">{preset.plant_supplier}</span>
							</div>
						{/if}
						{#if preset.notes}
							<div class="detail-item wide">
								<span class="detail-label">Notes:</span>
								<span class="detail-value">{preset.notes}</span>
							</div>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<p class="empty-state">No mix presets yet. Add one to get started.</p>
	{/if}
</section>

{#if showModal}
	<div
		class="modal-overlay"
		role="button"
		tabindex="-1"
		aria-label="Close dialog"
		onclick={closeModal}
		onkeydown={(e) => { if (e.key === 'Escape') closeModal(); }}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div class="modal" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
			<h4>{editingId ? 'Edit Preset' : 'Add Preset'}</h4>
			<form
				onsubmit={(e) => {
					e.preventDefault();
					savePreset();
				}}
			>
				<div class="field">
					<label for="name">Name *</label>
					<input
						type="text"
						id="name"
						bind:value={formName}
						required
						disabled={saving}
					/>
				</div>

				<div class="field">
					<label for="mix_type">Mix type</label>
					<select id="mix_type" bind:value={formMixType} disabled={saving}>
						{#each mixTypeOptions as opt}
							<option value={opt.value}>{opt.label}</option>
						{/each}
					</select>
				</div>

				<div class="grid">
					<div class="field">
						<label for="target_thickness_in">Target thickness (in)</label>
						<input
							type="number"
							id="target_thickness_in"
							bind:value={formTargetThicknessIn}
							step="0.5"
							min="0.5"
							max="10"
							disabled={saving}
						/>
					</div>

					<div class="field">
						<label for="target_spread_rate">Target spread rate (lbs/SY)</label>
						<input
							type="number"
							id="target_spread_rate"
							bind:value={formTargetSpreadRate}
							step="1"
							min="50"
							max="250"
							disabled={saving}
						/>
					</div>
				</div>

				<div class="grid">
					<div class="field">
						<label for="tack_type">Tack type</label>
						<input
							type="text"
							id="tack_type"
							bind:value={formTackType}
							disabled={saving}
						/>
					</div>

					<div class="field">
						<label for="target_tack_rate">Target tack rate (gal/SY)</label>
						<input
							type="number"
							id="target_tack_rate"
							bind:value={formTargetTackRate}
							step="0.001"
							min="0.01"
							max="0.20"
							disabled={saving}
						/>
					</div>
				</div>

				<div class="field">
					<label for="plant_supplier">Plant / supplier</label>
					<input
						type="text"
						id="plant_supplier"
						bind:value={formPlantSupplier}
						disabled={saving}
					/>
				</div>

				<div class="field">
					<label for="notes">Notes</label>
					<textarea
						id="notes"
						bind:value={formNotes}
						rows="3"
						disabled={saving}
					></textarea>
				</div>

				<div class="field checkbox-field">
					<label>
						<input
							type="checkbox"
							bind:checked={formIsDefault}
							disabled={saving}
						/>
						<span>Set as default</span>
					</label>
				</div>

				<div class="modal-actions">
					<button type="button" class="ghost-btn" onclick={closeModal} disabled={saving}>
						Cancel
					</button>
					<button type="submit" class="save-btn" disabled={saving}>
						{saving ? 'Saving...' : 'Save'}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<style>
	.btn-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}

	.btn-add {
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		padding: 14px 24px;
		border-radius: 8px;
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		min-height: 48px;
		transition: opacity 0.2s;
	}

	.btn-add:hover {
		opacity: 0.9;
	}

	.btn-gdot {
		background: transparent;
		border: 1px solid var(--border);
		color: var(--text);
		padding: 14px 24px;
		border-radius: 8px;
		font-weight: 500;
		font-size: 15px;
		cursor: pointer;
		min-height: 48px;
		display: inline-flex;
		align-items: center;
		gap: 8px;
		transition: all 0.2s;
	}

	.btn-gdot:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.btn-gdot:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.presets-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.preset-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 16px;
	}

	.preset-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 12px;
		gap: 12px;
	}

	.preset-title {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.preset-name {
		font-size: 16px;
		font-weight: 600;
		color: var(--text);
	}

	.preset-actions {
		display: flex;
		gap: 8px;
	}

	.action-btn {
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		min-width: 48px;
		min-height: 48px;
		transition: color 0.2s;
	}

	.action-btn:hover {
		color: var(--text);
		background: rgba(255, 255, 255, 0.05);
	}

	.action-btn.danger:hover {
		color: var(--bad);
	}

	.preset-details {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 8px;
		font-size: 14px;
	}

	.detail-item {
		display: flex;
		gap: 6px;
	}

	.detail-item.wide {
		grid-column: 1 / -1;
		flex-direction: column;
	}

	.detail-label {
		color: var(--text-muted);
		font-weight: 500;
	}

	.detail-value {
		color: var(--text);
	}

	.empty-state {
		color: var(--text-muted);
		text-align: center;
		padding: 24px;
		font-size: 14px;
	}

	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 16px;
	}

	.modal {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 24px;
		max-width: 600px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
	}

	.modal h4 {
		margin: 0 0 20px;
		color: var(--text);
		font-size: 18px;
		font-weight: 600;
	}

	.checkbox-field label {
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
	}

	.checkbox-field input[type="checkbox"] {
		width: auto;
		min-height: auto;
		cursor: pointer;
	}

	.checkbox-field span {
		color: var(--text);
		font-size: 14px;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
		justify-content: flex-end;
		margin-top: 20px;
	}

	@media (max-width: 640px) {
		.preset-details {
			grid-template-columns: 1fr;
		}
	}
</style>

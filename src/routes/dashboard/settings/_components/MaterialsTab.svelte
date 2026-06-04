<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api, ApiRequestError } from '$lib/utils/api-error';
	import { config } from '$lib/config';

	interface Material {
		id: string;
		name: string;
		category: string;
		density_tons_per_yd3: number | null;
		supplier: string | null;
		notes: string | null;
		base_material_id: string | null;
		sort_order: number;
		created_at: number | null;
		source: 'builtin' | 'override' | 'custom';
	}

	let { canEdit }: { canEdit: boolean } = $props();

	let materials = $state<Material[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let selectedMaterial = $state<Material | null>(null);
	let showAddForm = $state(false);
	let saving = $state(false);

	// Edit form state
	let editName = $state('');
	let editCategory = $state('');
	let editDensity = $state<number | null>(null);
	let editSupplier = $state('');
	let editNotes = $state('');

	// Add form state
	let addName = $state('');
	let addCategory = $state('aggregate');
	let addDensity = $state<number | null>(null);
	let addSupplier = $state('');
	let addNotes = $state('');

	const CATEGORIES = [
		{ value: 'aggregate', label: 'Aggregate' },
		{ value: 'asphalt', label: 'Asphalt' },
		{ value: 'soil', label: 'Soil' },
		{ value: 'concrete', label: 'Concrete' },
		{ value: 'other', label: 'Other' }
	];

	async function loadMaterials() {
		loading = true;
		error = null;
		try {
			const data = await api.get<{ materials?: Material[] }>('/api/org/materials', {
				credentials: 'include',
				silent: true
			});
			materials = data.materials || [];
		} catch (e) {
			error = e instanceof ApiRequestError ? e.message : 'Network error while loading materials';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadMaterials();
	});

	function selectMaterial(material: Material) {
		selectedMaterial = material;
		editName = material.name;
		editCategory = material.category;
		editDensity = material.density_tons_per_yd3;
		editSupplier = material.supplier || '';
		editNotes = material.notes || '';
		showAddForm = false;
	}

	function cancelEdit() {
		selectedMaterial = null;
		editName = '';
		editCategory = '';
		editDensity = null;
		editSupplier = '';
		editNotes = '';
	}

	async function saveEdit() {
		if (!selectedMaterial) return;

		saving = true;
		try {
			const body: Record<string, unknown> = {};

			if (selectedMaterial.source === 'custom') {
				body.name = editName.trim();
				body.category = editCategory;
			}

			body.density_tons_per_yd3 = editDensity;
			body.supplier = editSupplier.trim() || null;

			if (selectedMaterial.source === 'custom') {
				body.notes = editNotes.trim() || null;
			}

			await api.put(`/api/org/materials/${selectedMaterial.id}`, body, {
				credentials: 'include',
				errorMessage: 'Failed to save changes'
			});

			toastStore.success('Material updated successfully');
			cancelEdit();
			await loadMaterials();
		} catch (e) {
			if (!(e instanceof ApiRequestError)) toastStore.error('Network error while saving');
		} finally {
			saving = false;
		}
	}

	async function resetOverride() {
		if (!selectedMaterial || selectedMaterial.source !== 'override') return;

		saving = true;
		try {
			await api.delete(`/api/org/materials/${selectedMaterial.id}`, {
				credentials: 'include',
				errorMessage: 'Failed to reset override'
			});

			toastStore.success('Material reset to default');
			cancelEdit();
			await loadMaterials();
		} catch (e) {
			if (!(e instanceof ApiRequestError)) toastStore.error('Network error while resetting');
		} finally {
			saving = false;
		}
	}

	async function deleteMaterial() {
		if (!selectedMaterial || selectedMaterial.source !== 'custom') return;

		if (!confirm(`Delete custom material "${selectedMaterial.name}"? This cannot be undone.`)) {
			return;
		}

		saving = true;
		try {
			await api.delete(`/api/org/materials/${selectedMaterial.id}`, {
				credentials: 'include',
				errorMessage: 'Failed to delete material'
			});

			toastStore.success('Material deleted');
			cancelEdit();
			await loadMaterials();
		} catch (e) {
			if (!(e instanceof ApiRequestError)) toastStore.error('Network error while deleting');
		} finally {
			saving = false;
		}
	}

	function openAddForm() {
		showAddForm = true;
		selectedMaterial = null;
		addName = '';
		addCategory = 'aggregate';
		addDensity = null;
		addSupplier = '';
		addNotes = '';
	}

	function cancelAdd() {
		showAddForm = false;
		addName = '';
		addCategory = 'aggregate';
		addDensity = null;
		addSupplier = '';
		addNotes = '';
	}

	async function addMaterial() {
		if (!addName.trim()) {
			toastStore.error('Material name is required');
			return;
		}

		saving = true;
		try {
			const body: Record<string, unknown> = {
				name: addName.trim(),
				category: addCategory,
				density_tons_per_yd3: addDensity,
				supplier: addSupplier.trim() || null,
				notes: addNotes.trim() || null
			};

			await api.post('/api/org/materials', body, {
				credentials: 'include',
				errorMessage: 'Failed to add material'
			});

			toastStore.success('Material added successfully');
			cancelAdd();
			await loadMaterials();
		} catch (e) {
			if (!(e instanceof ApiRequestError)) toastStore.error('Network error while adding material');
		} finally {
			saving = false;
		}
	}

	function getBuiltinDensity(materialId: string): number | null {
		const builtin = config.materials?.find((m) => m.id === materialId);
		return builtin?.densityTonsPerYd3 ?? null;
	}

	function getCategoryLabel(category: string): string {
		return CATEGORIES.find((c) => c.value === category)?.label || category;
	}
</script>

<!-- Materials List -->
<section class="card">
	<h3>Materials Library</h3>
	<p class="card-desc">
		Manage organization materials. Override built-in densities or add custom materials.
	</p>

	{#if loading}
		<p class="loading-msg">Loading materials...</p>
	{:else if error}
		<div class="error-msg">{error}</div>
	{:else}
		<div class="materials-table">
			<div class="table-header">
				<div class="th th-name">Name</div>
				<div class="th th-category">Category</div>
				<div class="th th-density">Density</div>
				<div class="th th-supplier">Supplier</div>
				<div class="th th-source">Source</div>
			</div>
			{#each materials as material}
				<button
					type="button"
					class="material-row"
					class:active={selectedMaterial?.id === material.id}
					onclick={() => canEdit && selectMaterial(material)}
					disabled={!canEdit}
				>
					<div class="td td-name">{material.name}</div>
					<div class="td td-category">{getCategoryLabel(material.category)}</div>
					<div class="td td-density">
						{material.density_tons_per_yd3 != null
							? `${material.density_tons_per_yd3.toFixed(2)} tons/yd³`
							: '—'}
					</div>
					<div class="td td-supplier">{material.supplier || '—'}</div>
					<div class="td td-source">
						<span
							class="source-badge"
							class:badge-builtin={material.source === 'builtin'}
							class:badge-override={material.source === 'override'}
							class:badge-custom={material.source === 'custom'}
						>
							{material.source === 'builtin'
								? 'Built-in'
								: material.source === 'override'
									? 'Override'
									: 'Custom'}
						</span>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</section>

<!-- Edit/Override Panel -->
{#if selectedMaterial && canEdit}
	<section class="card">
		<h3>
			{selectedMaterial.source === 'custom' ? 'Edit Custom Material' : 'Override Built-in Material'}
		</h3>

		{#if selectedMaterial.source === 'builtin' || selectedMaterial.source === 'override'}
			{@const baseMaterialId = selectedMaterial.base_material_id}
			{@const defaultDensity = getBuiltinDensity(baseMaterialId || selectedMaterial.id)}
			<p class="card-desc">
				Original: {baseMaterialId
					? config.materials?.find((m) => m.id === baseMaterialId)?.label ||
						selectedMaterial.name
					: selectedMaterial.name}
				— Default: {defaultDensity != null ? `${defaultDensity.toFixed(2)} tons/yd³` : 'N/A'}
			</p>

			<div class="field">
				<label for="edit-density">Density (tons/yd³)</label>
				<input
					id="edit-density"
					type="number"
					min="0.5"
					max="3.0"
					step="0.01"
					bind:value={editDensity}
				/>
			</div>

			<div class="field">
				<label for="edit-supplier">Supplier</label>
				<input id="edit-supplier" type="text" bind:value={editSupplier} placeholder="Optional" />
			</div>

			<div class="edit-actions">
				<button type="button" class="ghost-btn" onclick={cancelEdit}>Cancel</button>
				{#if selectedMaterial.source === 'override'}
					<button type="button" class="ghost-btn danger" onclick={resetOverride} disabled={saving}>
						Reset to Default
					</button>
				{/if}
				<button type="button" class="save-btn" onclick={saveEdit} disabled={saving}>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		{:else if selectedMaterial.source === 'custom'}
			<div class="field">
				<label for="edit-name">Name</label>
				<input id="edit-name" type="text" bind:value={editName} required />
			</div>

			<div class="field">
				<label for="edit-category">Category</label>
				<select id="edit-category" bind:value={editCategory}>
					{#each CATEGORIES as cat}
						<option value={cat.value}>{cat.label}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label for="edit-density">Density (tons/yd³)</label>
				<input
					id="edit-density"
					type="number"
					min="0.5"
					max="3.0"
					step="0.01"
					bind:value={editDensity}
				/>
			</div>

			<div class="field">
				<label for="edit-supplier">Supplier</label>
				<input id="edit-supplier" type="text" bind:value={editSupplier} placeholder="Optional" />
			</div>

			<div class="field">
				<label for="edit-notes">Notes</label>
				<textarea id="edit-notes" bind:value={editNotes} placeholder="Optional notes"></textarea>
			</div>

			<div class="edit-actions">
				<button type="button" class="ghost-btn" onclick={cancelEdit}>Cancel</button>
				<button type="button" class="ghost-btn danger" onclick={deleteMaterial} disabled={saving}>
					Delete
				</button>
				<button type="button" class="save-btn" onclick={saveEdit} disabled={saving}>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		{/if}
	</section>
{/if}

<!-- Add Custom Material -->
{#if canEdit}
	<section class="card">
		{#if !showAddForm}
			<button type="button" class="ghost-btn" onclick={openAddForm}>
				+ Add Custom Material
			</button>
		{:else}
			<h3>Add Custom Material</h3>

			<div class="field">
				<label for="add-name">Name *</label>
				<input id="add-name" type="text" bind:value={addName} required />
			</div>

			<div class="field">
				<label for="add-category">Category *</label>
				<select id="add-category" bind:value={addCategory}>
					{#each CATEGORIES as cat}
						<option value={cat.value}>{cat.label}</option>
					{/each}
				</select>
			</div>

			<div class="field">
				<label for="add-density">Density (tons/yd³)</label>
				<input
					id="add-density"
					type="number"
					min="0.5"
					max="3.0"
					step="0.01"
					bind:value={addDensity}
					placeholder="Optional"
				/>
			</div>

			<div class="field">
				<label for="add-supplier">Supplier</label>
				<input id="add-supplier" type="text" bind:value={addSupplier} placeholder="Optional" />
			</div>

			<div class="field">
				<label for="add-notes">Notes</label>
				<textarea id="add-notes" bind:value={addNotes} placeholder="Optional notes"></textarea>
			</div>

			<div class="edit-actions">
				<button type="button" class="ghost-btn" onclick={cancelAdd}>Cancel</button>
				<button type="button" class="save-btn" onclick={addMaterial} disabled={saving}>
					{saving ? 'Adding...' : 'Add Material'}
				</button>
			</div>
		{/if}
	</section>
{/if}

<style>
	.loading-msg {
		color: var(--text-muted);
		font-size: 0.88rem;
		padding: 16px 0;
	}

	.error-msg {
		color: var(--bad);
		padding: 12px;
		border: 1px solid var(--bad);
		border-radius: var(--radius);
		background: rgba(var(--bad-rgb), 0.1);
	}

	.materials-table {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.table-header {
		display: grid;
		grid-template-columns: 2fr 1fr 1.2fr 1.2fr 0.8fr;
		gap: 12px;
		padding: 12px 16px;
		background: var(--bg);
		border-bottom: 1px solid var(--border);
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.th {
		text-align: left;
	}

	.material-row {
		display: grid;
		grid-template-columns: 2fr 1fr 1.2fr 1.2fr 0.8fr;
		gap: 12px;
		padding: 14px 16px;
		border: none;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font-size: 0.9rem;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s;
		width: 100%;
		min-height: 48px;
		align-items: center;
	}

	.material-row:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.material-row:disabled {
		cursor: default;
		opacity: 0.8;
	}

	.material-row.active {
		background: var(--surface-alt);
		border-left: 3px solid var(--accent);
	}

	.material-row:last-child {
		border-bottom: none;
	}

	.td {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.td-name {
		font-weight: 600;
	}

	.source-badge {
		display: inline-block;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.3px;
		padding: 3px 8px;
		border-radius: 100px;
		white-space: nowrap;
	}

	.badge-builtin {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-muted);
	}

	.badge-override {
		background: rgba(251, 191, 36, 0.15);
		color: #fbbf24;
	}

	.badge-custom {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}

	.edit-actions {
		display: flex;
		gap: 12px;
		align-items: center;
		justify-content: flex-end;
		padding-top: 16px;
		border-top: 1px solid var(--border);
		margin-top: 16px;
	}

	@media (max-width: 768px) {
		.table-header,
		.material-row {
			grid-template-columns: 1.5fr 1fr 1fr 0.8fr;
		}

		.th-supplier,
		.td-supplier {
			display: none;
		}
	}
</style>

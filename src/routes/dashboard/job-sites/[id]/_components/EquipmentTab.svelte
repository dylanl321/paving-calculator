<script lang="ts">
	import { equipmentTypeLabels } from './shared';
	import type { Equipment } from '../+page';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';

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

	interface EquipmentTemplate {
		id: string;
		name: string;
		items: Array<{
			equipment_type: string;
			name: string;
			capacity: string | null;
			notes: string | null;
		}>;
		created_at: number;
	}

	let {
		jobSiteId,
		jobSiteName = '',
		equipmentList = $bindable()
	}: {
		jobSiteId: string;
		jobSiteName?: string;
		equipmentList: Equipment[];
	} = $props();

	let newEquipment = $state({
		equipment_type: 'paver' as const,
		name: '',
		capacity: '',
		notes: ''
	});

	let saving = $state(false);
	let templates = $state<EquipmentTemplate[]>([]);
	let loadingTemplates = $state(false);
	let showAddFromTemplateModal = $state(false);
	let showSaveAsTemplateModal = $state(false);
	let templateName = $state('');
	let addingFromTemplate = $state(false);

	async function addEquipment() {
		if (!newEquipment.name) return;

		saving = true;
		try {
			const { equipment } = await api.post(`/api/job-sites/${jobSiteId}/equipment`, newEquipment) as EquipmentResponse;
			equipmentList = [...equipmentList, equipment];

			newEquipment = {
				equipment_type: 'paver',
				name: '',
				capacity: '',
				notes: ''
			};
			toastStore.success('Equipment added');
		} catch (err) {
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function removeEquipment(equipId: string) {
		saving = true;
		try {
			await api.delete(`/api/job-sites/${jobSiteId}/equipment/${equipId}`);
			equipmentList = equipmentList.filter((e) => e.id !== equipId);
			toastStore.success('Equipment removed');
		} catch (err) {
			console.error(err);
		} finally {
			saving = false;
		}
	}

	async function loadTemplates() {
		loadingTemplates = true;
		try {
			const response = await api.get('/api/org/equipment-templates') as { templates: EquipmentTemplate[] };
			templates = response.templates;
		} catch (err) {
			console.error('Failed to load templates:', err);
		} finally {
			loadingTemplates = false;
		}
	}

	function openAddFromTemplateModal() {
		loadTemplates();
		showAddFromTemplateModal = true;
	}

	function openSaveAsTemplateModal() {
		templateName = jobSiteName || '';
		showSaveAsTemplateModal = true;
	}

	async function addFromTemplate(template: EquipmentTemplate) {
		addingFromTemplate = true;
		try {
			const newItems: Equipment[] = [];
			for (const item of template.items) {
				const { equipment } = await api.post(`/api/job-sites/${jobSiteId}/equipment`, {
					equipment_type: item.equipment_type,
					name: item.name,
					capacity: item.capacity,
					notes: item.notes
				}) as EquipmentResponse;
				newItems.push(equipment);
			}
			equipmentList = [...equipmentList, ...newItems];
			toastStore.success(`${template.items.length} items added from template`);
			showAddFromTemplateModal = false;
		} catch (err) {
			console.error('Failed to add from template:', err);
		} finally {
			addingFromTemplate = false;
		}
	}

	async function saveAsTemplate() {
		if (!templateName.trim()) {
			toastStore.error('Template name is required');
			return;
		}

		saving = true;
		try {
			const items = equipmentList.map((e) => ({
				equipment_type: e.equipment_type,
				name: e.name,
				capacity: e.capacity ?? null,
				notes: e.notes ?? null
			}));

			await api.post('/api/org/equipment-templates', {
				name: templateName.trim(),
				items
			});

			toastStore.success('Template saved');
			showSaveAsTemplateModal = false;
			templateName = '';
		} catch (err) {
			console.error('Failed to save template:', err);
		} finally {
			saving = false;
		}
	}
</script>

<section class="section">
	<div class="section-header">
		<h3>Equipment List</h3>
		<div class="header-actions">
			{#if equipmentList.length > 0}
				<button class="btn-secondary" onclick={openSaveAsTemplateModal}>
					Save as Template
				</button>
			{/if}
			<button class="btn-secondary" onclick={openAddFromTemplateModal}>
				Add from Template
			</button>
		</div>
	</div>

	{#if equipmentList.length === 0}
		<div class="empty-state-mini">
			<div class="icon-circle">
				<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<circle cx="12" cy="12" r="10" opacity="0.4"></circle>
					<circle cx="12" cy="12" r="3"></circle>
					<line x1="12" y1="2" x2="12" y2="6"></line>
					<line x1="12" y1="18" x2="12" y2="22"></line>
					<line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
					<line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
					<line x1="2" y1="12" x2="6" y2="12"></line>
					<line x1="18" y1="12" x2="22" y2="12"></line>
					<line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
					<line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
				</svg>
			</div>
			<h4>No equipment assigned</h4>
			<p>Add equipment in the Configuration tab to track machinery and tools used on this project</p>
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

	{#if showAddFromTemplateModal}
		<div
			class="modal-overlay"
			role="presentation"
			onclick={() => { showAddFromTemplateModal = false; }}
			onkeydown={(e) => { if (e.key === 'Escape') showAddFromTemplateModal = false; }}
		>
			<div
				class="modal-card"
				role="dialog"
				aria-modal="true"
				aria-label="Add from Template"
				tabindex="-1"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="modal-header">
					<h4>Add from Template</h4>
					<button
						class="btn-icon"
						onclick={() => { showAddFromTemplateModal = false; }}
						aria-label="Close"
					>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>
				<div class="modal-body">
					{#if loadingTemplates}
						<div class="loading-state">Loading templates...</div>
					{:else if templates.length === 0}
						<div class="empty-state-small">
							<p>No templates saved yet. Add equipment to this job site, then use "Save as Template" to create one.</p>
						</div>
					{:else}
						<div class="template-list">
							{#each templates as template}
								<button
									class="template-item"
									onclick={() => addFromTemplate(template)}
									disabled={addingFromTemplate}
								>
									<div class="template-info">
										<div class="template-name">{template.name}</div>
										<div class="template-count">{template.items.length} items</div>
									</div>
									<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
										<polyline points="9 18 15 12 9 6"></polyline>
									</svg>
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	{#if showSaveAsTemplateModal}
		<div
			class="modal-overlay"
			role="presentation"
			onclick={() => { showSaveAsTemplateModal = false; }}
			onkeydown={(e) => { if (e.key === 'Escape') showSaveAsTemplateModal = false; }}
		>
			<div
				class="modal-card"
				role="dialog"
				aria-modal="true"
				aria-label="Save as Template"
				tabindex="-1"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="modal-header">
					<h4>Save as Template</h4>
					<button
						class="btn-icon"
						onclick={() => { showSaveAsTemplateModal = false; }}
						aria-label="Close"
					>
						<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
							<line x1="18" y1="6" x2="6" y2="18"></line>
							<line x1="6" y1="6" x2="18" y2="18"></line>
						</svg>
					</button>
				</div>
				<div class="modal-body">
					<div class="form-group">
						<label for="template_name">Template Name</label>
						<input
							type="text"
							id="template_name"
							bind:value={templateName}
							placeholder="e.g., Standard Paving Crew"
						/>
					</div>
					<div class="preview-section">
						<div class="preview-label">Items to save ({equipmentList.length}):</div>
						<div class="preview-list">
							{#each equipmentList as item}
								<div class="preview-item">
									<span class="preview-type">{equipmentTypeLabels[item.equipment_type]}</span>
									<span class="preview-name">{item.name}</span>
								</div>
							{/each}
						</div>
					</div>
					<button
						class="btn-primary"
						onclick={saveAsTemplate}
						disabled={!templateName.trim() || saving}
					>
						Save Template
					</button>
				</div>
			</div>
		</div>
	{/if}
</section>

<style>
	.empty-state-mini {
		text-align: center;
		padding: 32px 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 24px;
	}

	.empty-state-mini .icon-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: var(--background);
		border: 1px solid var(--border);
		margin-bottom: 16px;
	}

	.empty-state-mini svg {
		color: var(--accent);
	}

	.empty-state-mini h4 {
		margin: 0 0 6px;
		font-size: 1rem;
		color: var(--text);
		font-weight: 500;
	}

	.empty-state-mini p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		max-width: 350px;
		line-height: 1.4;
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
		margin-bottom: 20px;
		flex-wrap: wrap;
		gap: 12px;
	}

	.section-header h3 {
		margin: 0;
	}

	.header-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 16px;
	}

	.modal-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		max-width: 480px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 20px;
		border-bottom: 1px solid var(--border);
	}

	.modal-header h4 {
		margin: 0;
		font-size: 1.1rem;
		color: var(--text);
	}

	.btn-icon {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		min-width: 48px;
		min-height: 48px;
	}

	.btn-icon:hover {
		background: var(--background);
		color: var(--text);
	}

	.modal-body {
		padding: 20px;
	}

	.loading-state {
		text-align: center;
		padding: 32px;
		color: var(--text-muted);
	}

	.empty-state-small {
		text-align: center;
		padding: 32px 16px;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.empty-state-small p {
		margin: 0;
		line-height: 1.5;
	}

	.template-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.template-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		cursor: pointer;
		text-align: left;
		width: 100%;
		min-height: 48px;
		transition: background 0.2s;
	}

	.template-item:hover:not(:disabled) {
		background: var(--surface);
		border-color: var(--accent);
	}

	.template-item:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.template-info {
		flex: 1;
	}

	.template-name {
		font-weight: 600;
		color: var(--text);
		margin-bottom: 4px;
	}

	.template-count {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.preview-section {
		margin: 20px 0;
	}

	.preview-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.preview-list {
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
		max-height: 200px;
		overflow-y: auto;
	}

	.preview-item {
		padding: 8px 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
		border-bottom: 1px solid var(--border);
	}

	.preview-item:last-child {
		border-bottom: none;
	}

	.preview-type {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.preview-name {
		font-weight: 500;
		color: var(--text);
	}
</style>

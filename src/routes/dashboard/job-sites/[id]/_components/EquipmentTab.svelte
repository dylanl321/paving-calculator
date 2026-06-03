<script lang="ts">
	import { equipmentTypeLabels } from './shared';
	import type { Equipment } from '../$types';

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

	let {
		jobSiteId,
		equipmentList = $bindable()
	}: {
		jobSiteId: string;
		equipmentList: Equipment[];
	} = $props();

	let newEquipment = $state({
		equipment_type: 'paver' as const,
		name: '',
		capacity: '',
		notes: ''
	});

	let saving = $state(false);

	async function addEquipment() {
		if (!newEquipment.name) return;

		saving = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/equipment`, {
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
			const res = await fetch(`/api/job-sites/${jobSiteId}/equipment/${equipId}`, {
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
</script>

<section class="section">
	<h3>Equipment List</h3>

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
</style>

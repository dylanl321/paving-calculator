<script lang="ts">
	import NumberField from '../NumberField.svelte';
	import { X } from 'lucide-svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS } from '$lib/utils/unitConvert';
	import type { DbLoad } from '$lib/server/db';

	interface Props {
		jobSiteId: string;
		numLanes?: number | null;
		loads: DbLoad[];
		onSave: (ticketNumber: string, tons: number, notes: string, laneNumber: number | null, passNumber: number | null) => void;
		onCancel: () => void;
	}

	let { jobSiteId, numLanes = null, loads, onSave, onCancel }: Props = $props();

	let ticketNumberInput = $state('');
	let tonsInput = $state<number | null>(null);
	let notesInput = $state('');
	let laneNumberInput = $state<number | null>(null);
	let passNumberInput = $state<number | null>(null);

	function handleSave() {
		if (!tonsInput || tonsInput <= 0) return;
		onSave(ticketNumberInput, tonsInput, notesInput, laneNumberInput, passNumberInput);
		// Reset form
		ticketNumberInput = '';
		tonsInput = null;
		notesInput = '';
		laneNumberInput = null;
		passNumberInput = null;
	}

	function handleCancel() {
		ticketNumberInput = '';
		tonsInput = null;
		notesInput = '';
		laneNumberInput = null;
		passNumberInput = null;
		onCancel();
	}
</script>

<div class="new-load-form">
	<div class="form-header">
		<h4>Log New Load</h4>
		<button class="btn-close" onclick={handleCancel} aria-label="Close">
			<X size={20} />
		</button>
	</div>

	<div class="form-fields">
		<div class="field">
			<label for="ticket-number">Ticket # (optional)</label>
			<input
				id="ticket-number"
				type="text"
				bind:value={ticketNumberInput}
				placeholder="e.g., 12345"
			/>
		</div>

		{#if (numLanes && numLanes > 1) || loads.some(l => l.lane_number)}
			<div class="field">
				<label for="lane-number">Lane</label>
				<div class="lane-btns">
					{#each Array.from({length: numLanes || 4}, (_, i) => i + 1) as lane}
						<button
							type="button"
							class="lane-btn"
							class:active={laneNumberInput === lane}
							onclick={() => { laneNumberInput = laneNumberInput === lane ? null : lane; }}
						>
							{lane}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		<div class="field">
			<label for="pass-number">Pass</label>
			<div class="lane-btns">
				{#each [1, 2, 3, 4] as pass}
					<button
						type="button"
						class="lane-btn"
						class:active={passNumberInput === pass}
						onclick={() => { passNumberInput = passNumberInput === pass ? null : pass; }}
					>
						{pass === 1 ? '1st' : pass === 2 ? '2nd' : pass === 3 ? '3rd' : `${pass}th`}
					</button>
				{/each}
			</div>
		</div>

		<NumberField
			label="Tons"
			unit={UNIT_LABELS.tons[unitsStore.system]}
			bind:value={tonsInput}
			hint="Weight from ticket"
		/>

		<div class="field">
			<label for="notes">Notes (optional)</label>
			<input
				id="notes"
				type="text"
				bind:value={notesInput}
				placeholder="e.g., Hot mix, on time"
			/>
		</div>
	</div>

	<div class="form-actions">
		<button
			class="btn-save"
			onclick={handleSave}
			disabled={!tonsInput || tonsInput <= 0}
		>
			Save Load
		</button>
	</div>
</div>

<style>
	.new-load-form {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.form-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-4);
	}

	.form-header h4 {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.btn-close {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		min-width: 48px;
		padding: var(--sp-3);
		background: transparent;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
	}

	.btn-close:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.form-fields {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.field label {
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		color: var(--text);
	}

	.field input[type='text'],
	.field input[type='number'] {
		min-height: 48px;
		padding: var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-md);
	}

	.form-actions {
		margin-top: var(--sp-4);
	}

	.btn-save {
		width: 100%;
		min-height: 56px;
		padding: var(--sp-3) var(--sp-5);
		background: var(--accent);
		color: var(--text);
		border: none;
		border-radius: var(--radius-md);
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-save:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-save:not(:disabled):hover {
		background: color-mix(in srgb, var(--accent) 90%, white);
	}

	.btn-save:not(:disabled):active {
		transform: scale(0.98);
	}

	.lane-btns {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
	}

	.lane-btn {
		min-height: 48px;
		min-width: 56px;
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.lane-btn:hover {
		border-color: var(--accent);
		color: var(--text);
	}

	.lane-btn.active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--text);
		font-weight: var(--fw-bold);
	}
</style>

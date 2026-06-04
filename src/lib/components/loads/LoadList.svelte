<script lang="ts">
	import type { DbLoad } from '$lib/server/db';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS } from '$lib/utils/unitConvert';
	import { formatTime } from '$lib/utils/format';

	interface Props {
		loads: DbLoad[];
		jobSiteId: string;
		isAuthenticated?: boolean;
		onReject: (loadId: string, reason: string, notes: string) => Promise<void>;
		onUnreject: (loadId: string) => Promise<void>;
		onClearAll: () => void;
	}

	let { loads, jobSiteId, isAuthenticated = false, onReject, onUnreject, onClearAll }: Props = $props();

	const REJECTION_REASON_LABELS: Record<string, string> = {
		temp_too_low: 'Temp Too Low',
		temp_too_high: 'Temp Too High',
		wrong_mix: 'Wrong Mix',
		contaminated: 'Contaminated',
		overloaded: 'Overloaded',
		underweight: 'Underweight',
		damaged_in_transit: 'Damaged in Transit',
		other: 'Other'
	};

	const REJECTION_REASONS = Object.keys(REJECTION_REASON_LABELS);

	let rejectingLoadId = $state<string | null>(null);
	let rejectionReason = $state<string>('');
	let rejectionNotesInput = $state('');
	let rejecting = $state(false);

	function formatLoadTons(tons: number): number {
		return unitsStore.system === 'metric' ? tons * 0.907185 : tons;
	}

	async function handleRejectLoad(loadId: string) {
		if (!rejectionReason) return;
		rejecting = true;
		await onReject(loadId, rejectionReason, rejectionNotesInput);
		rejectingLoadId = null;
		rejectionReason = '';
		rejectionNotesInput = '';
		rejecting = false;
	}
</script>

<div class="load-history">
	<div class="history-header">
		<h4>Today's Loads</h4>
		<button class="btn-clear-all" onclick={onClearAll}>Clear All</button>
	</div>

	<div class="load-list">
		{#each loads as load (load.id)}
			<div class="load-item {load.rejected ? 'load-item--rejected' : ''}">
				<div class="load-main">
					<div class="load-info">
						{#if load.ticket_number}
							<span class="load-ticket">#{load.ticket_number}</span>
						{/if}
						<span class="load-tons {load.rejected ? 'load-tons--rejected' : ''}">{formatLoadTons(load.tons).toFixed(1)} {UNIT_LABELS.tons[unitsStore.system]}</span>
						{#if load.rejected}
							<span class="rejection-badge">{REJECTION_REASON_LABELS[load.rejection_reason ?? ''] ?? load.rejection_reason}</span>
						{/if}
					</div>
					<div class="load-actions">
						<span class="load-time">{formatTime(load.timestamp)}</span>
						{#if isAuthenticated}
							{#if load.rejected}
								<button class="btn-unreject" onclick={() => onUnreject(load.id)} aria-label="Mark as accepted">
									Undo
								</button>
							{:else}
								<button class="btn-reject" onclick={() => { rejectingLoadId = load.id; rejectionReason = ''; rejectionNotesInput = ''; }} aria-label="Reject load">
									Reject
								</button>
							{/if}
						{/if}
					</div>
				</div>
				{#if load.lane_number || load.pass_number}
					<div class="load-badges">
						{#if load.lane_number}
							<span class="badge badge-lane">L{load.lane_number}</span>
						{/if}
						{#if load.pass_number}
							<span class="badge badge-pass">P{load.pass_number}</span>
						{/if}
					</div>
				{/if}
				{#if load.notes}
					<div class="load-notes">{load.notes}</div>
				{/if}
				{#if load.rejection_notes}
					<div class="load-notes load-notes--rejection">Rejection notes: {load.rejection_notes}</div>
				{/if}
				{#if rejectingLoadId === load.id}
					<div class="reject-form">
						<div class="reject-form-header">Select rejection reason:</div>
						<div class="reason-grid">
							{#each REJECTION_REASONS as reason}
								<button
									class="reason-btn {rejectionReason === reason ? 'reason-btn--selected' : ''}"
									onclick={() => { rejectionReason = reason; }}
								>
									{REJECTION_REASON_LABELS[reason]}
								</button>
							{/each}
						</div>
						<div class="field" style="margin-top: var(--sp-3);">
							<label for="rejection-notes-{load.id}">Notes (optional)</label>
							<input id="rejection-notes-{load.id}" type="text" bind:value={rejectionNotesInput} placeholder="e.g., temp was 240F, spec requires 280F+" style="min-height:48px;padding:var(--sp-3);background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:var(--fs-md);" />
						</div>
						<div class="reject-form-actions">
							<button class="btn-cancel-reject" onclick={() => { rejectingLoadId = null; rejectionReason = ''; rejectionNotesInput = ''; }}>
								Cancel
							</button>
							<button class="btn-confirm-reject" onclick={() => handleRejectLoad(load.id)} disabled={!rejectionReason || rejecting}>
								{rejecting ? 'Saving...' : 'Confirm Reject'}
							</button>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
</div>

<style>
	.load-history {
		margin-top: var(--sp-4);
	}

	.history-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-3);
	}

	.history-header h4 {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.btn-clear-all {
		min-height: 48px;
		padding: var(--sp-2) var(--sp-4);
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-clear-all:hover {
		background: var(--surface-hover);
		border-color: var(--text-muted);
		color: var(--text);
	}

	.load-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.load-item {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-3);
	}

	.load-main {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.load-info {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.load-ticket {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}

	.load-tons {
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.load-time {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.load-notes {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-top: var(--sp-2);
		padding-top: var(--sp-2);
		border-top: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	.load-item--rejected {
		opacity: 0.7;
		border-color: color-mix(in srgb, var(--error, #ef4444) 40%, transparent);
		background: color-mix(in srgb, var(--error, #ef4444) 5%, var(--surface-alt));
	}

	.load-tons--rejected {
		text-decoration: line-through;
		color: var(--text-muted);
	}

	.rejection-badge {
		display: inline-block;
		background: color-mix(in srgb, var(--error, #ef4444) 15%, transparent);
		color: var(--error, #ef4444);
		border: 1px solid color-mix(in srgb, var(--error, #ef4444) 30%, transparent);
		border-radius: 9999px;
		padding: 2px 8px;
		font-size: var(--fs-xs);
		font-weight: var(--fw-medium);
		white-space: nowrap;
	}

	.load-actions {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex-shrink: 0;
	}

	.btn-reject {
		min-height: 36px;
		padding: var(--sp-1) var(--sp-3);
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--error, #ef4444) 40%, transparent);
		border-radius: var(--radius-sm);
		color: var(--error, #ef4444);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.btn-reject:hover {
		background: color-mix(in srgb, var(--error, #ef4444) 10%, transparent);
	}

	.btn-unreject {
		min-height: 36px;
		padding: var(--sp-1) var(--sp-3);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
	}

	.btn-unreject:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.reject-form {
		margin-top: var(--sp-3);
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}

	.reject-form-header {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}

	.reason-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-2);
	}

	.reason-btn {
		min-height: 48px;
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: center;
	}

	.reason-btn:hover {
		background: var(--surface-hover);
		border-color: var(--text-muted);
	}

	.reason-btn--selected {
		background: color-mix(in srgb, var(--error, #ef4444) 15%, transparent);
		border-color: var(--error, #ef4444);
		color: var(--error, #ef4444);
	}

	.reject-form-actions {
		display: flex;
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}

	.btn-cancel-reject {
		flex: 1;
		min-height: 48px;
		padding: var(--sp-3);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-md);
		font-weight: var(--fw-medium);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-cancel-reject:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.btn-confirm-reject {
		flex: 1;
		min-height: 48px;
		padding: var(--sp-3);
		background: var(--error, #ef4444);
		border: none;
		border-radius: var(--radius-sm);
		color: white;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-confirm-reject:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-confirm-reject:not(:disabled):hover {
		background: color-mix(in srgb, var(--error, #ef4444) 85%, black);
	}

	.load-notes--rejection {
		color: var(--error, #ef4444);
		font-style: italic;
	}

	.load-badges {
		display: flex;
		gap: var(--sp-1);
		margin-top: var(--sp-1);
	}

	.badge {
		display: inline-flex;
		align-items: center;
		padding: 2px 8px;
		border-radius: 999px;
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
	}

	.badge-lane {
		background: color-mix(in srgb, var(--accent) 20%, transparent);
		color: var(--accent);
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
	}

	.badge-pass {
		background: color-mix(in srgb, var(--text-muted) 15%, transparent);
		color: var(--text-muted);
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
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
</style>

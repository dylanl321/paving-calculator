<!--
	AddLoadSheet — the one Add load form, opened from Today, the map or a job.
	Ticket tons (required) and ticket number, plus a hint of how far the load
	should go at the job's width and rate. Posts to /api/job-sites/:id/loads.
-->
<script lang="ts">
	import { toastStore } from '$lib/stores/toast.svelte';
	import NumberField from '$lib/components/NumberField.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { tonsPerFoot } from '$lib/today-answer';

	let {
		open = $bindable(false),
		jobSiteId,
		jobName,
		nextLoadNumber,
		laneWidthFt = null,
		targetRateLbsSy = null,
		onsaved
	}: {
		open?: boolean;
		jobSiteId: string;
		jobName: string;
		nextLoadNumber: number;
		laneWidthFt?: number | null;
		targetRateLbsSy?: number | null;
		onsaved?: () => void;
	} = $props();

	let tons = $state<number | null>(null);
	let ticketNumber = $state('');
	let saving = $state(false);
	let dialogEl = $state<HTMLDialogElement | null>(null);

	const reachFt = $derived(
		tons && tons > 0 && laneWidthFt && targetRateLbsSy
			? Math.round(tons / tonsPerFoot(laneWidthFt, targetRateLbsSy))
			: null
	);

	$effect(() => {
		if (!dialogEl) return;
		if (open && !dialogEl.open) dialogEl.showModal();
		if (!open && dialogEl.open) dialogEl.close();
	});

	async function save() {
		if (tons == null || !(tons > 0)) {
			toastStore.error('Enter the tons on the ticket');
			return;
		}
		saving = true;
		try {
			const payload: { tons: number; timestamp: number; ticket_number?: string } = {
				tons,
				timestamp: Math.floor(Date.now() / 1000)
			};
			if (ticketNumber.trim()) payload.ticket_number = ticketNumber.trim();
			const res = await fetch(`/api/job-sites/${jobSiteId}/loads`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(payload)
			});
			if (!res.ok) {
				const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
				throw new Error(body.error || body.message || 'Could not save the load');
			}
			toastStore.success(`Load #${nextLoadNumber} saved: ${tons} t`);
			tons = null;
			ticketNumber = '';
			open = false;
			onsaved?.();
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Could not save the load');
		} finally {
			saving = false;
		}
	}
</script>

<dialog
	bind:this={dialogEl}
	class="sheet"
	aria-labelledby="add-load-title"
	onclose={() => (open = false)}
>
	<form
		method="dialog"
		class="sheet__body"
		onsubmit={(e) => {
			e.preventDefault();
			save();
		}}
	>
		<div class="sheet__head">
			<div>
				<h2 id="add-load-title">Add load #{nextLoadNumber}</h2>
				<p class="sheet__job">{jobName}</p>
			</div>
			<Button variant="ghost" type="button" onclick={() => (open = false)}>Cancel</Button>
		</div>
		<NumberField label="Tons on the ticket" unit="t" bind:value={tons} min={0} />
		<label class="ticket">
			<span>Ticket number (optional)</span>
			<input type="text" inputmode="numeric" autocomplete="off" bind:value={ticketNumber} />
		</label>
		{#if reachFt}
			<p class="sheet__hint">Should cover about {reachFt.toLocaleString()} ft at {targetRateLbsSy} lbs/SY.</p>
		{/if}
		<Button type="submit" block disabled={saving}>{saving ? 'Saving…' : 'Save load'}</Button>
	</form>
</dialog>

<style>
	.sheet {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		padding: 0;
		width: min(100%, 520px);
		max-width: 100%;
		margin: auto auto 0;
		background: var(--surface);
		color: var(--text);
	}
	@media (min-width: 640px) {
		.sheet {
			margin: auto;
			border-radius: var(--radius-lg);
		}
	}
	.sheet::backdrop {
		background: rgba(20, 22, 25, 0.45);
	}
	.sheet__body {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		padding: var(--sp-5) var(--sp-4) calc(var(--sp-5) + env(safe-area-inset-bottom));
	}
	.sheet__head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-3);
	}
	.sheet__head h2 {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-semibold);
	}
	.sheet__job {
		margin: 2px 0 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.ticket {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.ticket input {
		min-height: 48px;
		padding: 0 12px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--bg);
		color: var(--text);
		font: inherit;
		font-size: var(--fs-md);
	}
	.sheet__hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
</style>

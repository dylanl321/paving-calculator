<script lang="ts">
	import type { JobSite } from '../+page';
	import { api } from '$lib/utils/api-error';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		jobSite,
		canEdit,
		onSaved
	}: {
		jobSite: JobSite;
		canEdit: boolean;
		onSaved: (site: JobSite) => void;
	} = $props();

	// One-time snapshot of the loaded project into the edit form.
	// svelte-ignore state_referenced_locally
	let form = $state({
		name: jobSite.name,
		location: jobSite.location_description ?? '',
		jobNumber: jobSite.job_number ?? '',
		projectNumber: jobSite.project_number ?? '',
		customer: jobSite.customer_name ?? '',
		manager: jobSite.project_manager ?? '',
		workType: jobSite.work_type ?? '',
		startDate: jobSite.est_start_date ?? '',
		completionDate: jobSite.completion_date ?? '',
		contractAmount: jobSite.contract_amount != null ? String(jobSite.contract_amount) : ''
	});
	let saving = $state(false);

	async function save(event: Event) {
		event.preventDefault();
		if (!canEdit || saving) return;
		const trimmedName = form.name.trim();
		if (!trimmedName) {
			toastStore.error('Project name is required');
			return;
		}
		let amount: number | null = null;
		if (form.contractAmount.trim() !== '') {
			amount = Number(form.contractAmount);
			if (!Number.isFinite(amount) || amount < 0) {
				toastStore.error('Contract amount must be a non-negative number');
				return;
			}
		}
		saving = true;
		try {
			const updated = await api.patch<JobSite>(`/api/job-sites/${jobSite.id}`, {
				name: trimmedName,
				location_description: form.location.trim() || null,
				job_number: form.jobNumber.trim() || null,
				project_number: form.projectNumber.trim() || null,
				customer_name: form.customer.trim() || null,
				project_manager: form.manager.trim() || null,
				work_type: form.workType.trim() || null,
				est_start_date: form.startDate || null,
				completion_date: form.completionDate || null,
				contract_amount: amount
			});
			onSaved({ ...jobSite, ...updated });
			toastStore.success('Project details saved');
		} catch {
			// api.patch shows the error toast
		} finally {
			saving = false;
		}
	}
</script>

<form class="details" onsubmit={save}>
	<div class="grid">
		<label>
			Project name
			<input bind:value={form.name} required maxlength="200" disabled={!canEdit} />
		</label>
		<label>
			Location
			<input bind:value={form.location} maxlength="500" disabled={!canEdit} placeholder="Road, county, or address" />
		</label>
		<label>
			Job number
			<input bind:value={form.jobNumber} maxlength="80" disabled={!canEdit} />
		</label>
		<label>
			Project number
			<input bind:value={form.projectNumber} maxlength="80" disabled={!canEdit} />
		</label>
		<label>
			Customer
			<input bind:value={form.customer} maxlength="200" disabled={!canEdit} />
		</label>
		<label>
			Project manager
			<input bind:value={form.manager} maxlength="200" disabled={!canEdit} />
		</label>
		<label>
			Work type
			<input bind:value={form.workType} maxlength="120" disabled={!canEdit} placeholder="Overlay, mill and fill…" />
		</label>
		<label>
			Contract amount ($)
			<input bind:value={form.contractAmount} inputmode="decimal" disabled={!canEdit} />
		</label>
		<label>
			Start date
			<input type="date" bind:value={form.startDate} disabled={!canEdit} />
		</label>
		<label>
			Completion date
			<input type="date" bind:value={form.completionDate} disabled={!canEdit} />
		</label>
	</div>
	{#if canEdit}
		<div class="actions">
			<Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save project details'}</Button>
		</div>
	{/if}
</form>

<style>
	.details {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: var(--sp-3);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1, 4px);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	input {
		min-height: 48px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-weight: var(--fw-regular, 400);
	}

	input:disabled {
		opacity: 0.7;
	}

	.actions {
		display: flex;
		justify-content: flex-start;
	}
</style>

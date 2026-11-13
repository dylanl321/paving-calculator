<script lang="ts">
	import { api } from '$lib/utils/api-error';
	import { toastStore } from '$lib/stores/toast.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	type Draft =
		| {
				kind: 'weight_ticket';
				fields: {
					tons: number | null;
					mix: string | null;
					truck: string | null;
					ticket_number: string | null;
					time: string | null;
					date: string | null;
				};
		  }
		| {
				kind: 'material_certification';
				fields: {
					material: string | null;
					spec: string | null;
					supplier: string | null;
					category: string;
				};
		  }
		| {
				kind: 'daily_report';
				fields: {
					date: string | null;
					tons: number | null;
					weather: string | null;
					temp_f: number | null;
					notes: string | null;
					crew_count: number | null;
				};
		  };

	let { jobSiteId }: { jobSiteId: string } = $props();

	let text = $state('');
	let filename = $state<string | null>(null);
	let draft = $state<Draft | null>(null);
	let busy = $state(false);

	const kindLabel: Record<Draft['kind'], string> = {
		weight_ticket: 'Weight ticket',
		material_certification: 'Material certification',
		daily_report: 'Daily report'
	};

	async function onFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		filename = file.name;
		if (/\.pdf$/i.test(file.name)) {
			const body = new FormData();
			body.set('file', file);
			busy = true;
			try {
				const res = await fetch(`/api/job-sites/${jobSiteId}/field-documents`, {
					method: 'POST',
					body,
					credentials: 'include'
				});
				const data = (await res.json()) as { draft?: Draft; error?: string };
				if (!res.ok || !data.draft) {
					toastStore.error(data.error ?? 'Could not read that file');
					return;
				}
				draft = data.draft;
			} catch {
				toastStore.error('Could not read that file');
			} finally {
				busy = false;
			}
			return;
		}
		text = await file.text();
	}

	async function preview() {
		if (!text.trim() || busy) return;
		busy = true;
		try {
			const data = await api.post<{ draft: Draft }>(`/api/job-sites/${jobSiteId}/field-documents`, {
				action: 'preview',
				text
			});
			draft = data.draft;
		} catch {
			draft = null;
		} finally {
			busy = false;
		}
	}

	async function confirmSave() {
		if (!draft || busy) return;
		busy = true;
		try {
			const data = await api.post<{ saved: { summary: string } }>(
				`/api/job-sites/${jobSiteId}/field-documents`,
				{ action: 'commit', kind: draft.kind, fields: draft.fields, filename }
			);
			toastStore.success(data.saved.summary);
			draft = null;
			text = '';
			filename = null;
		} catch {
			// api.post shows the error
		} finally {
			busy = false;
		}
	}
</script>

<div class="field-doc">
	<p class="hint">
		Paste a weight ticket, material certification, or daily report. Review the fields, then save.
		Nothing is stored until you confirm.
	</p>
	<label>
		Document text
		<textarea bind:value={text} rows="6" placeholder="Paste the ticket or report text"></textarea>
	</label>
	<label class="file">
		Or upload a PDF or text file
		<input type="file" accept=".pdf,.txt,text/plain,application/pdf" onchange={onFile} />
	</label>
	<Button onclick={preview} disabled={busy || !text.trim()}>{busy ? 'Reading…' : 'Review fields'}</Button>

	{#if draft}
		<form
			class="review"
			onsubmit={(event) => {
				event.preventDefault();
				void confirmSave();
			}}
		>
			<h4>{kindLabel[draft.kind]}</h4>
			{#if draft.kind === 'weight_ticket'}
				<label>Tons <input bind:value={draft.fields.tons} inputmode="decimal" required /></label>
				<label>Mix <input bind:value={draft.fields.mix} /></label>
				<label>Truck <input bind:value={draft.fields.truck} /></label>
				<label>Ticket <input bind:value={draft.fields.ticket_number} /></label>
				<label>Time <input bind:value={draft.fields.time} placeholder="HH:MM" /></label>
				<label>Date <input bind:value={draft.fields.date} placeholder="YYYY-MM-DD" /></label>
			{:else if draft.kind === 'material_certification'}
				<label>Material <input bind:value={draft.fields.material} required /></label>
				<label>Spec <input bind:value={draft.fields.spec} /></label>
				<label>Supplier <input bind:value={draft.fields.supplier} /></label>
				<label>
					Category
					<select bind:value={draft.fields.category}>
						<option value="asphalt">Asphalt</option>
						<option value="aggregate">Aggregate</option>
						<option value="soil">Soil</option>
						<option value="concrete">Concrete</option>
						<option value="other">Other</option>
					</select>
				</label>
			{:else}
				<label>Date <input bind:value={draft.fields.date} required placeholder="YYYY-MM-DD" /></label>
				<label>Tons placed <input bind:value={draft.fields.tons} inputmode="decimal" /></label>
				<label>
					Weather
					<select bind:value={draft.fields.weather}>
						<option value="">—</option>
						<option value="clear">Clear</option>
						<option value="cloudy">Cloudy</option>
						<option value="rain">Rain</option>
						<option value="wind">Wind</option>
						<option value="fog">Fog</option>
					</select>
				</label>
				<label>Temp °F <input bind:value={draft.fields.temp_f} inputmode="decimal" /></label>
				<label>Crew <input bind:value={draft.fields.crew_count} inputmode="numeric" /></label>
				<label class="wide">Notes <textarea bind:value={draft.fields.notes} rows="3"></textarea></label>
			{/if}
			<Button type="submit" disabled={busy}>Save to this project</Button>
		</form>
	{/if}
</div>

<style>
	.field-doc {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	textarea,
	input,
	select {
		min-height: 48px;
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font: inherit;
		font-weight: 400;
	}

	textarea {
		min-height: 120px;
	}

	.review {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.review h4,
	.review :global(button),
	.wide {
		grid-column: 1 / -1;
	}

	h4 {
		margin: 0;
	}
</style>

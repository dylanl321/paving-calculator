<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/utils/api-error';

	type OrgRow = { id: string; name: string; role: string };

	let orgs = $state<OrgRow[]>([]);
	let activeId = $state('');
	let saving = $state(false);

	onMount(() => {
		void load();
	});

	async function load() {
		try {
			const data = await api.get<{ orgs?: OrgRow[]; active_org_id?: string | null }>('/api/user/orgs', {
				silent: true
			});
			orgs = data.orgs ?? [];
			activeId = data.active_org_id ?? orgs[0]?.id ?? '';
		} catch {
			orgs = [];
		}
	}

	async function change(event: Event) {
		const next = (event.currentTarget as HTMLSelectElement).value;
		if (!next || next === activeId || saving) return;
		saving = true;
		try {
			await api.post('/api/user/active-org', { org_id: next });
			window.location.reload();
		} catch {
			saving = false;
		}
	}
</script>

{#if orgs.length > 1}
	<label class="org-switch">
		<span>Organization</span>
		<select value={activeId} onchange={change} disabled={saving} aria-label="Active organization">
			{#each orgs as org (org.id)}
				<option value={org.id}>{org.name}</option>
			{/each}
		</select>
	</label>
{/if}

<style>
	.org-switch {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: var(--sp-3);
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	select {
		min-height: 48px;
		padding: 0 var(--sp-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
</style>

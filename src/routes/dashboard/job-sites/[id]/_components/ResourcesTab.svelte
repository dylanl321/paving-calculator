<!--
	ResourcesTab — the "Resources" surface. Composes the existing EquipmentTab plus
	the project's crew assignments as sections. Reuses EquipmentTab as-is and
	renders the already-loaded assignments list with shared primitives.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Equipment, Assignment } from '../+page';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import EquipmentTab from './EquipmentTab.svelte';
	import { api } from '$lib/utils/api-error';
	import { toastStore } from '$lib/stores/toast.svelte';

	type CrewMember = { user_id: string; name?: string; email?: string };
	type Crew = { id: string; name: string; color: string; members?: CrewMember[] };

	let {
		jobSiteId,
		jobSiteName = '',
		equipmentList = $bindable(),
		assignments = [],
		canManageCrews = false
	}: {
		jobSiteId: string;
		jobSiteName?: string;
		equipmentList: Equipment[];
		assignments?: Assignment[];
		canManageCrews?: boolean;
	} = $props();

	let assignedCrews = $state<Crew[]>([]);
	let orgCrews = $state<Crew[]>([]);
	let crewsLoading = $state(true);
	let selectedCrewId = $state('');
	let crewBusy = $state(false);

	const unassignedCrews = $derived(
		orgCrews.filter((crew) => !assignedCrews.some((assigned) => assigned.id === crew.id))
	);

	onMount(() => {
		void loadCrews();
	});

	async function loadCrews() {
		crewsLoading = true;
		try {
			const assigned = await api.get<{ crews?: Crew[] }>(`/api/job-sites/${jobSiteId}/crews`);
			assignedCrews = assigned.crews ?? [];
			if (canManageCrews) {
				const all = await api.get<{ crews?: Crew[] }>('/api/org/crews');
				orgCrews = all.crews ?? [];
			}
		} catch {
			assignedCrews = [];
		} finally {
			crewsLoading = false;
		}
	}

	async function assignCrew() {
		if (!selectedCrewId || crewBusy) return;
		crewBusy = true;
		try {
			await api.post(`/api/job-sites/${jobSiteId}/crews`, { crew_id: selectedCrewId });
			selectedCrewId = '';
			toastStore.success('Crew assigned to this project');
			await loadCrews();
		} catch {
			// api.post shows the error toast
		} finally {
			crewBusy = false;
		}
	}

	async function removeCrew(crewId: string) {
		if (crewBusy) return;
		crewBusy = true;
		try {
			await api.delete(`/api/job-sites/${jobSiteId}/crews?crew_id=${encodeURIComponent(crewId)}`);
			toastStore.success('Crew removed from this project');
			await loadCrews();
		} catch {
			// api.delete shows the error toast
		} finally {
			crewBusy = false;
		}
	}
</script>

<div class="resources-tab">
	<section class="resources-tab__group">
		<SectionHeader
			title="Equipment"
			subtitle="Paving train and support equipment assigned to this project."
			as="h3"
		/>
		<EquipmentTab {jobSiteId} {jobSiteName} bind:equipmentList />
	</section>

	<section class="resources-tab__group">
		<SectionHeader
			title="Crew"
			subtitle="Foremen and field crews only see projects their crew is assigned to."
			as="h3"
		/>
		{#if crewsLoading}
			<Card padding="md"><p class="resources-empty">Loading crews…</p></Card>
		{:else if assignedCrews.length === 0 && !canManageCrews}
			<Card padding="md">
				<p class="resources-empty">No crew is assigned to this project yet.</p>
			</Card>
		{:else}
			<div class="crew-list">
				{#each assignedCrews as crew (crew.id)}
					<div class="crew-card crew-card--block">
						<div class="crew-info">
							<div class="crew-name">{crew.name}</div>
							<div class="crew-role">
								{#if crew.members && crew.members.length > 0}
									{crew.members.map((member) => member.name || member.email || 'Member').join(', ')}
								{:else}
									No people on this crew yet
								{/if}
							</div>
						</div>
						{#if canManageCrews}
							<Button variant="ghost" size="sm" disabled={crewBusy} onclick={() => removeCrew(crew.id)}>
								Remove
							</Button>
						{/if}
					</div>
				{/each}
			</div>
			{#if canManageCrews}
				{#if orgCrews.length === 0}
					<Card padding="md">
						<p class="resources-empty">
							No crews exist yet.
							<a href="/dashboard/team">Create a crew on the team page</a>, then assign it here.
						</p>
					</Card>
				{:else if unassignedCrews.length > 0}
					<div class="crew-assign">
						<label class="sr" for="assign-crew">Assign a crew</label>
						<select id="assign-crew" bind:value={selectedCrewId}>
							<option value="">Choose a crew…</option>
							{#each unassignedCrews as crew (crew.id)}
								<option value={crew.id}>{crew.name}</option>
							{/each}
						</select>
						<Button disabled={!selectedCrewId || crewBusy} onclick={assignCrew}>Assign crew</Button>
					</div>
				{/if}
			{/if}
		{/if}

		{#if assignments.length > 0}
			<h4 class="legacy-title">Individual assignments</h4>
			<div class="crew-list">
				{#each assignments as assignment (assignment.user_name + assignment.role)}
					<div class="crew-card">
						<div class="crew-avatar">{assignment.user_name.charAt(0).toUpperCase()}</div>
						<div class="crew-info">
							<div class="crew-name">{assignment.user_name}</div>
							<div class="crew-role">{assignment.role}</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.resources-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-8, 40px);
	}

	.resources-tab__group {
		min-width: 0;
	}

	.resources-empty {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.crew-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.crew-card {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3);
	}

	.crew-avatar {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 50%;
		font-weight: var(--fw-bold);
		font-size: var(--fs-md);
		flex-shrink: 0;
	}

	.crew-info {
		flex: 1;
		min-width: 0;
	}

	.crew-name {
		font-weight: var(--fw-semibold);
		margin-bottom: 2px;
	}

	.crew-role {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		text-transform: capitalize;
	}

	.crew-card--block {
		align-items: flex-start;
	}

	.crew-assign {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: center;
		margin-top: var(--sp-3);
	}

	.crew-assign select {
		min-height: 48px;
		min-width: 200px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}

	.legacy-title {
		margin: var(--sp-4) 0 var(--sp-2);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.sr {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}
</style>

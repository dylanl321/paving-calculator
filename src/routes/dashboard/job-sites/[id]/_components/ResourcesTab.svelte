<!--
	ResourcesTab — the "Resources" surface. Composes the existing EquipmentTab plus
	the project's crew assignments as sections. Reuses EquipmentTab as-is and
	renders the already-loaded assignments list with shared primitives.
-->
<script lang="ts">
	import type { Equipment, Assignment } from '../+page';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import EquipmentTab from './EquipmentTab.svelte';

	let {
		jobSiteId,
		jobSiteName = '',
		equipmentList = $bindable(),
		assignments = []
	}: {
		jobSiteId: string;
		jobSiteName?: string;
		equipmentList: Equipment[];
		assignments?: Assignment[];
	} = $props();
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
			subtitle="People assigned to this project."
			as="h3"
		/>
		{#if assignments.length === 0}
			<Card padding="md">
				<p class="resources-empty">No crew members assigned yet.</p>
			</Card>
		{:else}
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
</style>

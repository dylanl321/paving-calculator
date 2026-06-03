<script lang="ts">
	import type { Milestone } from '../$types';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface MilestoneResponse {
		milestone: Milestone;
	}

	let {
		jobSiteId,
		milestones = $bindable()
	}: {
		jobSiteId: string;
		milestones: Milestone[];
	} = $props();

	let milestoneForm = $state({
		name: '',
		description: '',
		status: 'pending' as 'pending' | 'in_progress' | 'completed',
		target_date: ''
	});
	let showMilestoneForm = $state(false);
	let milestoneSaving = $state(false);

	async function createMilestone() {
		if (!milestoneForm.name) return;

		milestoneSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/milestones`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify(milestoneForm)
			});

			if (!res.ok) {
				toastStore.error('Failed to create milestone');
				throw new Error('Failed to create milestone');
			}

			const { milestone } = (await res.json()) as MilestoneResponse;
			milestones = [...milestones, milestone];

			milestoneForm = {
				name: '',
				description: '',
				status: 'pending',
				target_date: ''
			};
			showMilestoneForm = false;
			toastStore.success('Milestone created');
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to create milestone');
		} finally {
			milestoneSaving = false;
		}
	}

	async function updateMilestoneStatus(id: string, status: 'pending' | 'in_progress' | 'completed') {
		milestoneSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/milestones/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ status })
			});

			if (!res.ok) {
				toastStore.error('Failed to update milestone');
				throw new Error('Failed to update milestone');
			}

			const { milestone } = (await res.json()) as MilestoneResponse;
			milestones = milestones.map((m) => (m.id === id ? milestone : m));
			toastStore.success('Milestone updated');
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to update milestone');
		} finally {
			milestoneSaving = false;
		}
	}

	async function deleteMilestone(id: string) {
		milestoneSaving = true;
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/milestones/${id}`, {
				method: 'DELETE',
				credentials: 'include'
			});

			if (!res.ok) {
				toastStore.error('Failed to delete milestone');
				throw new Error('Failed to delete milestone');
			}

			milestones = milestones.filter((m) => m.id !== id);
			toastStore.success('Milestone deleted');
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to delete milestone');
		} finally {
			milestoneSaving = false;
		}
	}
</script>

<section class="section">
	<div class="section-header">
		<h3>Project Milestones</h3>
		<button class="btn-primary" onclick={() => (showMilestoneForm = !showMilestoneForm)}>
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
				<line x1="12" y1="5" x2="12" y2="19"></line>
				<line x1="5" y1="12" x2="19" y2="12"></line>
			</svg>
			{showMilestoneForm ? 'Cancel' : 'Add Milestone'}
		</button>
	</div>

	{#if milestones.length > 0}
		<div class="milestone-progress">
			<div class="milestone-progress-header">
				<span class="milestone-progress-label">
					{milestones.filter((m) => m.status === 'completed').length} of {milestones.length} complete
				</span>
			</div>
			<div class="progress-bar">
				<div
					class="progress-fill"
					style="width: {(milestones.filter((m) => m.status === 'completed').length / milestones.length) * 100}%"
				></div>
			</div>
		</div>
	{/if}

	{#if showMilestoneForm}
		<div class="milestone-form">
			<div class="form-group">
				<label for="milestone_name">Name</label>
				<input
					type="text"
					id="milestone_name"
					bind:value={milestoneForm.name}
					placeholder="e.g., Base Layer Complete"
				/>
			</div>

			<div class="form-group">
				<label for="milestone_description">Description</label>
				<textarea
					id="milestone_description"
					bind:value={milestoneForm.description}
					rows="3"
					placeholder="Additional details..."
				></textarea>
			</div>

			<div class="form-row">
				<div class="form-group">
					<label for="milestone_status">Status</label>
					<select id="milestone_status" bind:value={milestoneForm.status}>
						<option value="pending">Pending</option>
						<option value="in_progress">In Progress</option>
						<option value="completed">Completed</option>
					</select>
				</div>

				<div class="form-group">
					<label for="milestone_target_date">Target Date</label>
					<input type="date" id="milestone_target_date" bind:value={milestoneForm.target_date} />
				</div>
			</div>

			<div class="form-actions">
				<button class="btn-primary" onclick={createMilestone} disabled={!milestoneForm.name || milestoneSaving}>
					Add Milestone
				</button>
				<button class="btn btn-ghost" onclick={() => (showMilestoneForm = false)}>Cancel</button>
			</div>
		</div>
	{/if}

	{#if milestones.length === 0}
		<div class="empty-state-mini">
			<p>No milestones yet. Add one to track project phases.</p>
		</div>
	{:else}
		<div class="milestone-list">
			{#each milestones as milestone (milestone.id)}
				<div class="milestone-card">
					<div class="milestone-header">
						<div class="milestone-status-badge status-{milestone.status}">
							<span class="status-dot"></span>
						</div>
						<div class="milestone-info">
							<h4 class="milestone-name">{milestone.name}</h4>
							{#if milestone.description}
								<p class="milestone-description">{milestone.description}</p>
							{/if}
							{#if milestone.target_date}
								<span class="milestone-date">
									Target: {new Date(milestone.target_date).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}
								</span>
							{/if}
						</div>
					</div>
					<div class="milestone-actions">
						<select
							class="milestone-status-select"
							value={milestone.status}
							onchange={(e) => updateMilestoneStatus(milestone.id, e.currentTarget.value as any)}
							disabled={milestoneSaving}
						>
							<option value="pending">Pending</option>
							<option value="in_progress">In Progress</option>
							<option value="completed">Completed</option>
						</select>
						<button
							class="btn-remove"
							onclick={() => deleteMilestone(milestone.id)}
							disabled={milestoneSaving}
							aria-label="Delete milestone"
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
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.milestone-progress {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 16px;
	}

	.milestone-progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 8px;
	}

	.milestone-progress-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.progress-bar {
		height: 8px;
		background: var(--surface-alt);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: var(--accent);
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.milestone-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.form-actions {
		display: flex;
		gap: 12px;
		margin-top: 16px;
	}

	.milestone-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.milestone-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;
	}

	.milestone-header {
		flex: 1;
		display: flex;
		align-items: flex-start;
		gap: 12px;
		min-width: 0;
	}

	.milestone-status-badge {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.milestone-status-badge.status-pending {
		background: rgba(128, 128, 128, 0.1);
	}

	.milestone-status-badge.status-in_progress {
		background: rgba(59, 130, 246, 0.1);
	}

	.milestone-status-badge.status-completed {
		background: rgba(34, 197, 94, 0.1);
	}

	.status-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.milestone-status-badge.status-pending .status-dot {
		background: var(--text-muted);
	}

	.milestone-status-badge.status-in_progress .status-dot {
		background: var(--warn);
	}

	.milestone-status-badge.status-completed .status-dot {
		background: var(--good);
	}

	.milestone-info {
		flex: 1;
		min-width: 0;
	}

	.milestone-name {
		margin: 0 0 4px;
		font-size: 1rem;
		font-weight: 600;
	}

	.milestone-description {
		margin: 0 0 4px;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.milestone-date {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.milestone-actions {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-shrink: 0;
	}

	.milestone-status-select {
		min-height: 40px;
		padding: 0 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
	}

	.milestone-status-select:focus {
		outline: 2px solid var(--accent);
		outline-offset: 0;
	}

	@media (max-width: 768px) {
		.milestone-card {
			flex-direction: column;
		}

		.milestone-actions {
			width: 100%;
			justify-content: space-between;
		}

		.milestone-status-select {
			flex: 1;
		}
	}
</style>

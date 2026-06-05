<script lang="ts">
	import type { Milestone } from '../+page';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { api } from '$lib/utils/api-error';

	interface MilestoneResponse {
		milestone: Milestone;
	}

	interface Suggestion {
		pct: number;
		name: string;
		description: string;
		target_tons: number;
		est_date: string | null;
	}

	interface SuggestionsResponse {
		suggestions: Suggestion[];
		avg_daily_tons: number;
		data_source: 'history' | 'default';
		active_days: number;
	}

	let {
		jobSiteId,
		milestones = $bindable(),
		totalTonnage = null,
		estStartDate = null
	}: {
		jobSiteId: string;
		milestones: Milestone[];
		totalTonnage?: number | null;
		estStartDate?: string | null;
	} = $props();

	let milestoneForm = $state({
		name: '',
		description: '',
		status: 'pending' as 'pending' | 'in_progress' | 'completed',
		target_date: ''
	});
	let showMilestoneForm = $state(false);
	let milestoneSaving = $state(false);

	// Schedule suggestions state
	let suggestionsResponse: SuggestionsResponse | null = $state(null);
	let loadingSuggestions = $state(false);
	let suggestionsLoaded = $state(false);
	let dismissedSuggestions = $state(new Set<number>());
	let acceptingSuggestions = $state(false);

	async function createMilestone() {
		if (!milestoneForm.name) return;

		milestoneSaving = true;
		try {
			const { milestone } = await api.post(`/api/job-sites/${jobSiteId}/milestones`, milestoneForm) as MilestoneResponse;
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
		} finally {
			milestoneSaving = false;
		}
	}

	async function updateMilestoneStatus(id: string, status: 'pending' | 'in_progress' | 'completed') {
		milestoneSaving = true;
		try {
			const { milestone } = await api.put(`/api/job-sites/${jobSiteId}/milestones/${id}`, { status }) as MilestoneResponse;
			milestones = milestones.map((m) => (m.id === id ? milestone : m));
			toastStore.success('Milestone updated');
		} catch (err) {
			console.error(err);
		} finally {
			milestoneSaving = false;
		}
	}

	async function deleteMilestone(id: string) {
		milestoneSaving = true;
		try {
			await api.delete(`/api/job-sites/${jobSiteId}/milestones/${id}`);
			milestones = milestones.filter((m) => m.id !== id);
			toastStore.success('Milestone deleted');
		} catch (err) {
			console.error(err);
		} finally {
			milestoneSaving = false;
		}
	}

	async function generateSchedule() {
		loadingSuggestions = true;
		try {
			const response = await api.get(`/api/job-sites/${jobSiteId}/schedule-suggestions`) as SuggestionsResponse;
			suggestionsResponse = response;
			suggestionsLoaded = true;
			dismissedSuggestions.clear();
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to generate schedule');
		} finally {
			loadingSuggestions = false;
		}
	}

	async function acceptSuggestion(suggestion: Suggestion) {
		acceptingSuggestions = true;
		try {
			const { milestone } = await api.post(`/api/job-sites/${jobSiteId}/milestones`, {
				name: suggestion.name,
				description: suggestion.description,
				status: 'pending',
				target_date: suggestion.est_date
			}) as MilestoneResponse;

			milestones = [...milestones, milestone];
			dismissedSuggestions.add(suggestion.pct);
			toastStore.success('Milestone added');
		} catch (err) {
			console.error(err);
			toastStore.error('Failed to add milestone');
		} finally {
			acceptingSuggestions = false;
		}
	}

	async function acceptAllSuggestions() {
		if (!suggestionsResponse) return;

		acceptingSuggestions = true;
		const toAccept = suggestionsResponse.suggestions.filter(s => !dismissedSuggestions.has(s.pct));

		for (const suggestion of toAccept) {
			try {
				const { milestone } = await api.post(`/api/job-sites/${jobSiteId}/milestones`, {
					name: suggestion.name,
					description: suggestion.description,
					status: 'pending',
					target_date: suggestion.est_date
				}) as MilestoneResponse;

				milestones = [...milestones, milestone];
				dismissedSuggestions.add(suggestion.pct);
			} catch (err) {
				console.error(err);
			}
		}

		toastStore.success('Milestones added');
		acceptingSuggestions = false;
	}

	function dismissSuggestion(pct: number) {
		dismissedSuggestions.add(pct);
	}

	// Computed: visible suggestions
	const visibleSuggestions = $derived(
		suggestionsResponse ? suggestionsResponse.suggestions.filter(s => !dismissedSuggestions.has(s.pct)) : []
	);
</script>

<section class="section">
	<div class="section-header">
		<h3>Project Milestones</h3>
		<div class="header-actions">
			{#if totalTonnage}
				<button
					class="btn-secondary"
					onclick={generateSchedule}
					disabled={loadingSuggestions || acceptingSuggestions}
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
						<circle cx="12" cy="12" r="10"></circle>
						<polyline points="12 6 12 12 16 14"></polyline>
					</svg>
					{loadingSuggestions ? 'Loading...' : 'Generate Schedule'}
				</button>
			{/if}
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

	{#if suggestionsLoaded && visibleSuggestions.length > 0}
		<div class="suggestions-panel">
			<div class="suggestions-header">
				<div class="suggestions-title">
					<h4>Schedule Suggestions</h4>
					{#if suggestionsResponse}
						<span class="suggestions-note">
							Based on {suggestionsResponse.avg_daily_tons} tons/day avg
							{suggestionsResponse.data_source === 'history' ? `(${suggestionsResponse.active_days} active days)` : '(default estimate)'}
						</span>
					{/if}
				</div>
				<button
					class="btn-accept-all"
					onclick={acceptAllSuggestions}
					disabled={acceptingSuggestions || visibleSuggestions.length === 0}
				>
					Accept All
				</button>
			</div>

			{#if !totalTonnage || !estStartDate}
				<div class="suggestions-warning">
					Set total tonnage and start date in Configuration tab for date estimates
				</div>
			{/if}

			<div class="suggestion-list">
				{#each visibleSuggestions as suggestion (suggestion.pct)}
					<div class="suggestion-card">
						<div class="suggestion-badge">{suggestion.pct}%</div>
						<div class="suggestion-content">
							<h5 class="suggestion-name">{suggestion.name}</h5>
							<p class="suggestion-description">{suggestion.description}</p>
							{#if suggestion.est_date}
								<span class="suggestion-date">
									Target: {new Date(suggestion.est_date).toLocaleDateString('en-US', {
										month: 'short',
										day: 'numeric',
										year: 'numeric'
									})}
								</span>
							{/if}
						</div>
						<div class="suggestion-actions">
							<button
								class="btn-accept"
								onclick={() => acceptSuggestion(suggestion)}
								disabled={acceptingSuggestions}
								aria-label="Accept suggestion"
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
									<polyline points="20 6 9 17 4 12"></polyline>
								</svg>
							</button>
							<button
								class="btn-dismiss"
								onclick={() => dismissSuggestion(suggestion.pct)}
								disabled={acceptingSuggestions}
								aria-label="Dismiss suggestion"
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

	.header-actions {
		display: flex;
		gap: 8px;
	}

	.btn-secondary {
		min-height: 48px;
		padding: 0 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.btn-secondary:hover {
		background: var(--surface-alt);
	}

	.btn-secondary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.suggestions-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-left: 3px solid var(--accent);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.suggestions-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 16px;
		gap: 16px;
	}

	.suggestions-title h4 {
		margin: 0 0 4px;
		font-size: 1.1rem;
		font-weight: 600;
	}

	.suggestions-note {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.suggestions-warning {
		background: rgba(255, 193, 7, 0.1);
		border: 1px solid rgba(255, 193, 7, 0.3);
		border-radius: var(--radius);
		padding: 12px;
		margin-bottom: 16px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.btn-accept-all {
		min-height: 40px;
		padding: 0 16px;
		background: var(--accent);
		border: none;
		border-radius: var(--radius);
		color: white;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 0.15s ease;
	}

	.btn-accept-all:hover {
		opacity: 0.9;
	}

	.btn-accept-all:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.suggestion-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.suggestion-card {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}

	.suggestion-badge {
		min-width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: white;
		border-radius: 50%;
		font-size: 0.85rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.suggestion-content {
		flex: 1;
		min-width: 0;
	}

	.suggestion-name {
		margin: 0 0 4px;
		font-size: 1rem;
		font-weight: 600;
	}

	.suggestion-description {
		margin: 0 0 4px;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}

	.suggestion-date {
		font-size: 0.75rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.suggestion-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.btn-accept,
	.btn-dismiss {
		min-width: 40px;
		min-height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.btn-accept {
		background: rgba(34, 197, 94, 0.1);
		color: var(--good);
	}

	.btn-accept:hover {
		background: rgba(34, 197, 94, 0.2);
	}

	.btn-dismiss {
		background: var(--surface);
		color: var(--text-muted);
	}

	.btn-dismiss:hover {
		background: var(--surface-alt);
	}

	.btn-accept:disabled,
	.btn-dismiss:disabled {
		opacity: 0.5;
		cursor: not-allowed;
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

		.header-actions {
			flex-direction: column;
			width: 100%;
		}

		.header-actions button {
			width: 100%;
		}

		.suggestions-header {
			flex-direction: column;
		}

		.btn-accept-all {
			width: 100%;
		}

		.suggestion-card {
			flex-wrap: wrap;
		}

		.suggestion-actions {
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>

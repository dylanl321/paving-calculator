<script lang="ts">
	import { config } from '$lib/config';
	import { api } from '$lib/utils/api-error';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	let entries = $state(data.entries);
	// svelte-ignore state_referenced_locally
	let nextCursor = $state(data.nextCursor);
	let loading = $state(false);
	let selectedCategory = $state('');

	const categories = [
		{ value: '', label: 'All' },
		{ value: 'org_member', label: 'Members' },
		{ value: 'crew', label: 'Crews' },
		{ value: 'org_branding', label: 'Settings' },
		{ value: 'email_schedule', label: 'Schedules' },
		{ value: 'notification_prefs', label: 'Notifications' }
	];

	async function onCategoryChange() {
		loading = true;
		try {
			const params = new URLSearchParams();
			params.set('limit', '50');
			if (selectedCategory) {
				params.set('resource_type', selectedCategory);
			}

			const result = await api.get<{ entries?: typeof entries; next_cursor?: number | null }>(`/api/audit?${params.toString()}`);
			entries = result.entries ?? [];
			nextCursor = result.next_cursor ?? null;
		} catch (err) {
			console.error('Failed to filter by category', err);
		} finally {
			loading = false;
		}
	}

	async function loadMore() {
		if (!nextCursor || loading) return;
		loading = true;

		try {
			const params = new URLSearchParams();
			params.set('limit', '50');
			params.set('before', String(nextCursor));
			if (selectedCategory) {
				params.set('resource_type', selectedCategory);
			}

			const result = await api.get<{ entries?: typeof entries; next_cursor?: number | null }>(`/api/audit?${params.toString()}`);
			entries = [...entries, ...(result.entries ?? [])];
			nextCursor = result.next_cursor ?? null;
		} catch (err) {
			console.error('Failed to load more entries', err);
		} finally {
			loading = false;
		}
	}

	function formatTimestamp(ts: number): string {
		const date = new Date(ts * 1000);
		const now = Date.now();
		const diff = now - date.getTime();

		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) return 'Just now';
		if (minutes < 60) return `${minutes}m ago`;
		if (hours < 24) return `${hours}h ago`;
		if (days < 7) return `${days}d ago`;

		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
		});
	}

	function formatFullDate(ts: number): string {
		return new Date(ts * 1000).toLocaleString('en-US', {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
	}

	function getActionBadgeClass(action: string): string {
		if (action === 'created' || action === 'upserted' || action === 'logo_uploaded') return 'badge-created';
		if (action === 'updated' || action === 'role_changed') return 'badge-updated';
		if (action === 'deleted' || action === 'removed' || action === 'logo_removed') return 'badge-deleted';
		return 'badge-other';
	}

	function truncateId(id: string | null): string {
		if (id == null) return '';
		return id.length > 8 ? id.slice(0, 8) : id;
	}
</script>

<svelte:head>
	<title>Org Activity — {config.app.name} Admin</title>
</svelte:head>

<header class="admin-page-header">
	<div>
		<h1 class="admin-page-title">Org Activity</h1>
		<p class="admin-page-subtitle">Member, crew, settings, and schedule changes for your organization.</p>
	</div>
	<a href="/dashboard/activity" class="header-action">View Full Activity</a>
</header>

<div class="filters">
	<div class="filter-group">
		<label for="category-filter">Category</label>
		<select id="category-filter" bind:value={selectedCategory} onchange={onCategoryChange}>
			{#each categories as cat}
				<option value={cat.value}>{cat.label}</option>
			{/each}
		</select>
	</div>
</div>

{#if entries.length === 0}
	<div class="empty-state">
		<h4>No org activity yet</h4>
		<p>No organization-level changes have been logged yet.</p>
	</div>
{:else}
	<div class="activity-table">
		{#each entries as entry (entry.id)}
			<div class="activity-row">
				<div class="activity-time" title={formatFullDate(entry.created_at)}>
					{formatTimestamp(entry.created_at)}
				</div>
				<div class="activity-actor">{entry.actor_name || 'System'}</div>
				<div class="activity-action">
					<span class="action-badge {getActionBadgeClass(entry.action)}">{entry.action}</span>
				</div>
				<div class="activity-resource">
					<span class="resource-type">{entry.resource_type}</span>
					<span class="resource-id" title={entry.resource_id}>{truncateId(entry.resource_id)}</span>
				</div>
			</div>
		{/each}
	</div>

	{#if nextCursor}
		<div class="load-more-container">
			<button class="btn-load-more" onclick={loadMore} disabled={loading}>
				{loading ? 'Loading...' : 'Load More'}
			</button>
		</div>
	{/if}
{/if}

<style>
	.filters {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 20px;
		display: flex;
		gap: 16px;
		align-items: flex-end;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
	}

	.filter-group label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.filter-group select {
		min-height: 48px;
		padding: 0 12px;
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-family: inherit;
	}

	.filter-group select:focus {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}

	.empty-state {
		text-align: center;
		padding: 48px 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
		font-weight: 600;
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.activity-table {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.activity-row {
		display: grid;
		grid-template-columns: 100px 1fr auto 1fr;
		gap: 12px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
		align-items: center;
		min-height: 48px;
	}

	.activity-row:last-child {
		border-bottom: none;
	}

	.activity-time {
		font-size: 0.85rem;
		color: var(--text-muted);
		cursor: help;
	}

	.activity-actor {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.activity-action {
		display: flex;
		align-items: center;
	}

	.action-badge {
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
	}

	.badge-created {
		background: var(--good);
		color: var(--accent-text);
	}

	.badge-updated {
		background: var(--accent);
		color: var(--accent-text);
	}

	.badge-deleted {
		background: var(--bad);
		color: var(--accent-text);
	}

	.badge-other {
		background: var(--text-muted);
		color: var(--bg);
	}

	.activity-resource {
		display: flex;
		align-items: center;
		gap: 8px;
		overflow: hidden;
	}

	.resource-type {
		font-size: 0.85rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.resource-id {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--text);
		background: var(--bg);
		padding: 2px 6px;
		border-radius: 3px;
		cursor: help;
	}

	.load-more-container {
		display: flex;
		justify-content: center;
		margin-top: 24px;
	}

	.btn-load-more {
		min-height: 48px;
		padding: 0 24px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-load-more:hover:not(:disabled) {
		background: var(--bg);
	}

	.btn-load-more:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.activity-row {
			grid-template-columns: 1fr;
			gap: 6px;
			padding: 16px;
		}

		.activity-resource {
			order: -1;
		}
	}
</style>

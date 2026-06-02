<script lang="ts">
	import { config } from '$lib/config';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let entries = $state(data.entries);
	let nextCursor = $state(data.nextCursor);
	let loading = $state(false);

	async function loadMore() {
		if (!nextCursor || loading) return;
		loading = true;

		try {
			const res = await fetch(`/api/audit?limit=50&before=${nextCursor}`, {
				credentials: 'include'
			});

			if (res.ok) {
				const result = await res.json();
				entries = [...entries, ...result.entries];
				nextCursor = result.next_cursor;
			}
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
		if (action === 'created') return 'badge-created';
		if (action === 'updated') return 'badge-updated';
		if (action === 'deleted') return 'badge-deleted';
		return 'badge-other';
	}

	function truncateId(id: string): string {
		return id.length > 8 ? id.slice(0, 8) : id;
	}
</script>

<svelte:head>
	<title>Audit Log — {config.app.name}</title>
</svelte:head>

<div class="audit-page">
	<div class="page-header">
		<h2 class="page-title">Audit Log</h2>
		<p class="page-subtitle">Activity history for your organization</p>
	</div>

	{#if entries.length === 0}
		<div class="empty-state">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<line x1="12" y1="18" x2="12" y2="12"></line>
				<line x1="9" y1="15" x2="15" y2="15"></line>
			</svg>
			<h4>No audit entries yet</h4>
			<p>Activity will appear here as users make changes</p>
		</div>
	{:else}
		<div class="audit-table">
			{#each entries as entry (entry.id)}
				<div class="audit-row">
					<div class="audit-time" title={formatFullDate(entry.created_at)}>
						{formatTimestamp(entry.created_at)}
					</div>
					<div class="audit-actor">{entry.actor_name || 'System'}</div>
					<div class="audit-action">
						<span class="action-badge {getActionBadgeClass(entry.action)}">{entry.action}</span>
					</div>
					<div class="audit-resource">
						<span class="resource-type">{entry.resource_type}</span>
						<span class="resource-id" title={entry.resource_id}>{truncateId(entry.resource_id)}</span>
					</div>
					<div class="audit-ip">{entry.ip_address || '—'}</div>
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
</div>

<style>
	.audit-page {
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 4px;
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.empty-state {
		text-align: center;
		padding: 64px 20px;
		color: var(--text-muted);
	}

	.empty-state svg {
		opacity: 0.5;
		margin-bottom: 16px;
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		color: var(--text);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
	}

	.audit-table {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.audit-row {
		display: grid;
		grid-template-columns: 100px 1fr auto 1fr 120px;
		gap: 12px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
		align-items: center;
		min-height: 48px;
	}

	.audit-row:last-child {
		border-bottom: none;
	}

	.audit-time {
		font-size: 0.85rem;
		color: var(--text-muted);
		cursor: help;
	}

	.audit-actor {
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.audit-action {
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

	.audit-resource {
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

	.audit-ip {
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--text-muted);
		text-align: right;
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
		background: var(--surface-hover);
	}

	.btn-load-more:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.audit-row {
			grid-template-columns: 1fr;
			gap: 6px;
			padding: 16px;
		}

		.audit-time {
			grid-column: 1;
		}

		.audit-actor {
			font-size: 0.95rem;
		}

		.audit-resource {
			order: -1;
		}

		.audit-ip {
			text-align: left;
			font-size: 0.75rem;
		}
	}
</style>

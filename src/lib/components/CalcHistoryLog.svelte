<script lang="ts">
	import { calcHistory } from '$lib/stores/calcHistory.svelte';

	// ── Time-ago formatter ──────────────────────────────────────────────────
	function timeAgo(timestamp: number): string {
		const diff = Date.now() - timestamp;
		const mins = Math.floor(diff / 60_000);
		const hrs = Math.floor(diff / 3_600_000);
		if (mins < 1) return 'just now';
		if (mins < 60) return `${mins}m ago`;
		if (hrs < 24) return `${hrs}h ago`;
		const d = new Date(timestamp);
		const now = new Date();
		// Check if yesterday
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		if (d.toDateString() === yesterday.toDateString()) return 'yesterday';
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	// ── Accent color per tool ───────────────────────────────────────────────
	const TOOL_COLORS: Record<string, string> = {
		'spread-rate': '#f59e0b',
		tonnage: '#3b82f6',
		'feet-left': '#22c55e',
		tack: '#a855f7',
		'stick-check': '#f97316'
	};

	function toolColor(toolId: string): string {
		return TOOL_COLORS[toolId] ?? '#6b7280';
	}
</script>

<div class="history-log">
	<div class="history-header">
		<h3 class="history-title">Recent Calculations</h3>
		{#if calcHistory.entries.length > 0}
			<button
				class="clear-btn"
				onclick={() => calcHistory.clear()}
				aria-label="Clear calculation history"
				title="Clear history"
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
					<polyline points="3 6 5 6 21 6"></polyline>
					<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
					<path d="M10 11v6"></path>
					<path d="M14 11v6"></path>
					<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
				</svg>
			</button>
		{/if}
	</div>

	{#if calcHistory.entries.length === 0}
		<p class="empty-state">No calculations yet — results appear here as you work.</p>
	{:else}
		<ul class="entry-list">
			{#each calcHistory.entries as entry (entry.id)}
				<li class="entry" style="border-left-color: {toolColor(entry.toolId)}">
					<div class="entry-top">
						<span class="tool-label">{entry.toolLabel}</span>
						<span class="time-ago">{timeAgo(entry.timestamp)}</span>
					</div>
					<div class="entry-result">{entry.result}</div>
					<div class="entry-summary">{entry.summary}</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.history-log {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow: hidden;
	}

	.history-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
	}

	.history-title {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.clear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		padding: 0;
		margin: -0.5rem -0.5rem -0.5rem 0;
		background: transparent;
		border: none;
		border-radius: 8px;
		color: var(--text-muted);
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
	}
	.clear-btn:hover {
		color: var(--bad);
		background: color-mix(in srgb, var(--bad) 12%, transparent);
	}

	.empty-state {
		margin: 0;
		padding: 2rem 1rem;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.entry-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.entry {
		padding: 0.75rem 1rem;
		border-left: 3px solid transparent;
		border-bottom: 1px solid var(--border);
		transition: background 0.1s;
	}
	.entry:last-child {
		border-bottom: none;
	}
	.entry:hover {
		background: var(--surface-hover);
	}

	.entry-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.2rem;
	}

	.tool-label {
		font-size: 0.7rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
	}

	.time-ago {
		font-size: 0.7rem;
		color: var(--text-muted);
	}

	.entry-result {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--accent);
		line-height: 1.2;
		margin-bottom: 0.15rem;
	}

	.entry-summary {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>

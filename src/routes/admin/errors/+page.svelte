<script lang="ts">
	import { onMount } from 'svelte';

	interface ErrorSummary {
		fingerprint: string;
		count: number;
		first_seen: number;
		last_seen: number;
		sample_message: string;
		sample_stack: string | null;
		affected_routes: string[];
		affected_users_count: number;
	}

	interface TrendBucket {
		hour: string;
		count: number;
	}

	interface ErrorData {
		summary: {
			total_errors: number;
			unique_errors: number;
			error_rate: number;
		};
		errors: ErrorSummary[];
		trend: TrendBucket[];
	}

	type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d';
	type SortMode = 'count' | 'recent';

	let data = $state<ErrorData | null>(null);
	let loading = $state(true);
	let error = $state('');
	let selectedRange = $state<TimeRange>('24h');
	let sortMode = $state<SortMode>('count');
	let expandedFingerprint = $state<string | null>(null);

	onMount(() => {
		loadErrors();
	});

	$effect(() => {
		// Reload when range or sort changes
		void selectedRange;
		void sortMode;
		loadErrors();
	});

	async function loadErrors() {
		loading = true;
		error = '';
		try {
			const params = new URLSearchParams({
				range: selectedRange,
				sort: sortMode
			});
			const res = await fetch(`/api/admin/errors?${params}`);
			if (!res.ok) {
				error = res.status === 403 ? 'Access denied' : 'Failed to load errors';
				loading = false;
				return;
			}
			data = (await res.json()) as ErrorData;
		} catch {
			error = 'Failed to load errors';
		} finally {
			loading = false;
		}
	}

	async function resolveError(fingerprint: string) {
		try {
			const res = await fetch('/api/admin/errors/resolve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ fingerprint })
			});
			if (!res.ok) {
				console.error('Failed to resolve error');
				return;
			}
			// Remove from local list
			if (data) {
				data.errors = data.errors.filter((e) => e.fingerprint !== fingerprint);
				data.summary.unique_errors = data.errors.length;
			}
			if (expandedFingerprint === fingerprint) {
				expandedFingerprint = null;
			}
		} catch {
			console.error('Failed to resolve error');
		}
	}

	function toggleExpanded(fingerprint: string) {
		if (expandedFingerprint === fingerprint) {
			expandedFingerprint = null;
		} else {
			expandedFingerprint = fingerprint;
		}
	}

	function formatRelativeTime(timestamp: number): string {
		const now = Math.floor(Date.now() / 1000);
		const diff = now - timestamp;
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
		return new Date(timestamp * 1000).toLocaleDateString();
	}

	function truncate(text: string, maxLen: number): string {
		if (text.length <= maxLen) return text;
		return text.substring(0, maxLen) + '...';
	}

	const maxTrendCount = $derived(data ? Math.max(...data.trend.map((t) => t.count), 1) : 1);
</script>

<div class="errors-page">
	<header class="admin-page-header">
		<div>
			<h1 class="admin-page-title">Error Tracking</h1>
			<p class="admin-page-subtitle">Monitor and diagnose application errors.</p>
		</div>
	</header>

	<!-- Time range selector -->
	<div class="range-bar">
		{#each ['1h', '6h', '24h', '7d', '30d'] as range}
			<button
				class="range-btn"
				class:active={selectedRange === range}
				onclick={() => (selectedRange = range as TimeRange)}
			>
				{range}
			</button>
		{/each}

		<div class="range-divider"></div>

		<button
			class="sort-btn"
			class:active={sortMode === 'count'}
			onclick={() => (sortMode = 'count')}
		>
			Most Frequent
		</button>
		<button
			class="sort-btn"
			class:active={sortMode === 'recent'}
			onclick={() => (sortMode = 'recent')}
		>
			Most Recent
		</button>
	</div>

	{#if loading}
		<div class="loading-msg">Loading error data...</div>
	{:else if error}
		<div class="error-msg">{error}</div>
	{:else if data}
		<!-- Summary cards -->
		<div class="summary-cards">
			<div class="summary-card">
				<div class="card-value">{data.summary.total_errors.toLocaleString()}</div>
				<div class="card-label">Total Errors</div>
			</div>
			<div class="summary-card">
				<div class="card-value">{data.summary.unique_errors.toLocaleString()}</div>
				<div class="card-label">Unique Error Types</div>
			</div>
			<div class="summary-card">
				<div class="card-value">{data.summary.error_rate.toFixed(2)}%</div>
				<div class="card-label">Error Rate</div>
			</div>
		</div>

		<!-- Trend chart -->
		{#if data.trend.length > 0}
			<div class="trend-card">
				<h3 class="trend-title">Errors per Hour (Last 24h)</h3>
				<div class="trend-chart">
					{#each data.trend as bucket}
						<div class="trend-bar-wrapper">
							<div
								class="trend-bar"
								style="height: {(bucket.count / maxTrendCount) * 100}%"
								title="{bucket.hour}: {bucket.count} errors"
							></div>
							<div class="trend-label">
								{new Date(bucket.hour).getHours()}h
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Error list -->
		{#if data.errors.length === 0}
			<div class="empty-msg">No errors found in the selected time range.</div>
		{:else}
			<div class="errors-list">
				{#each data.errors as err (err.fingerprint)}
					<div class="error-card">
						<div
							class="error-header"
							role="button"
							tabindex="0"
							onclick={() => toggleExpanded(err.fingerprint)}
							onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpanded(err.fingerprint); } }}
						>
							<div class="error-main">
								<div class="error-message">
									{truncate(err.sample_message, 80)}
								</div>
								<div class="error-meta">
									<span class="error-count-badge">{err.count}</span>
									<span class="error-time">Last seen {formatRelativeTime(err.last_seen)}</span>
									{#if err.affected_routes.length > 0}
										<span class="error-routes">
											{truncate(err.affected_routes.join(', '), 60)}
										</span>
									{/if}
								</div>
							</div>
							<div class="expand-icon" class:expanded={expandedFingerprint === err.fingerprint}>
								▼
							</div>
						</div>

						{#if expandedFingerprint === err.fingerprint}
							<div class="error-details">
								<div class="detail-section">
									<h4>Full Message</h4>
									<pre class="error-text">{err.sample_message}</pre>
								</div>

								{#if err.sample_stack}
									<div class="detail-section">
										<h4>Stack Trace</h4>
										<pre class="error-text">{err.sample_stack}</pre>
									</div>
								{/if}

								<div class="detail-section">
									<h4>Affected Routes</h4>
									{#if err.affected_routes.length > 0}
										<ul class="routes-list">
											{#each err.affected_routes as route}
												<li>{route}</li>
											{/each}
										</ul>
									{:else}
										<p class="text-muted">No specific routes recorded</p>
									{/if}
								</div>

								<div class="detail-section">
									<h4>Stats</h4>
									<div class="stats-grid">
										<div>
											<strong>Occurrences:</strong>
											{err.count}
										</div>
										<div>
											<strong>Affected Users:</strong>
											{err.affected_users_count}
										</div>
										<div>
											<strong>First Seen:</strong>
											{formatRelativeTime(err.first_seen)}
										</div>
										<div>
											<strong>Last Seen:</strong>
											{formatRelativeTime(err.last_seen)}
										</div>
									</div>
								</div>

								<button class="resolve-btn" onclick={() => resolveError(err.fingerprint)}>
									Mark as Resolved
								</button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.errors-page {
		width: 100%;
	}

	/* Range bar */
	.range-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 1.5rem;
		padding: 1rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
	}

	.range-btn,
	.sort-btn {
		min-height: 48px;
		padding: 0 1.25rem;
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		background: var(--bg);
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s;
	}

	.range-btn:hover,
	.sort-btn:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.range-btn.active,
	.sort-btn.active {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
	}

	.range-divider {
		width: 1px;
		height: 32px;
		background: var(--border);
		margin: 0 0.5rem;
	}

	/* Summary cards */
	.summary-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.summary-card {
		padding: 1.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
	}

	.card-value {
		font-size: 2rem;
		font-weight: 700;
		color: var(--text);
		margin-bottom: 0.25rem;
	}

	.card-label {
		font-size: 0.875rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	/* Trend chart */
	.trend-card {
		padding: 1.5rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		margin-bottom: 1.5rem;
	}

	.trend-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		margin-bottom: 1rem;
	}

	.trend-chart {
		display: flex;
		align-items: flex-end;
		gap: 4px;
		height: 120px;
		padding: 0.5rem 0;
	}

	.trend-bar-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
	}

	.trend-bar {
		width: 100%;
		min-height: 2px;
		background: var(--danger, #f87171);
		border-radius: 2px;
		transition: opacity 0.2s;
	}

	.trend-bar-wrapper:hover .trend-bar {
		opacity: 0.7;
	}

	.trend-label {
		font-size: 0.65rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	/* Error list */
	.errors-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.error-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		overflow: hidden;
	}

	.error-header {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1rem;
		cursor: pointer;
		transition: background 0.15s;
		min-height: 48px;
	}

	.error-header:hover {
		background: var(--surface-hover, rgba(255, 255, 255, 0.02));
	}

	.error-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.error-message {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--text);
		line-height: 1.4;
		word-break: break-word;
	}

	.error-meta {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.error-count-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		height: 28px;
		padding: 0 0.75rem;
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 9999px;
		font-size: 0.75rem;
		font-weight: 700;
	}

	.error-time {
		white-space: nowrap;
	}

	.error-routes {
		font-family: monospace;
		font-size: 0.75rem;
	}

	.expand-icon {
		flex-shrink: 0;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		font-size: 0.75rem;
		transition: transform 0.2s;
	}

	.expand-icon.expanded {
		transform: rotate(180deg);
	}

	/* Error details */
	.error-details {
		padding: 0 1rem 1rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding-top: 1.5rem;
	}

	.detail-section h4 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 0.75rem;
	}

	.error-text {
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
		padding: 1rem;
		font-family: monospace;
		font-size: 0.8rem;
		color: var(--text);
		overflow-x: auto;
		white-space: pre-wrap;
		word-break: break-word;
		max-height: 300px;
		overflow-y: auto;
	}

	.routes-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.routes-list li {
		font-family: monospace;
		font-size: 0.85rem;
		color: var(--text);
		padding: 0.5rem 1rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius, 0.5rem);
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 1rem;
		font-size: 0.875rem;
	}

	.stats-grid strong {
		color: var(--text-muted);
		font-weight: 600;
		margin-right: 0.5rem;
	}

	.resolve-btn {
		min-height: 48px;
		padding: 0 1.5rem;
		background: var(--accent);
		color: #fff;
		border: 1px solid var(--accent);
		border-radius: var(--radius, 0.5rem);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.15s;
		align-self: flex-start;
	}

	.resolve-btn:hover {
		opacity: 0.9;
	}

	/* Status messages */
	.error-msg,
	.loading-msg,
	.empty-msg {
		padding: 2rem;
		text-align: center;
		border-radius: var(--radius, 0.5rem);
		border: 1px solid var(--border);
	}

	.error-msg {
		color: #f87171;
		background: rgba(239, 68, 68, 0.08);
		border-color: rgba(239, 68, 68, 0.3);
	}

	.loading-msg,
	.empty-msg {
		color: var(--text-muted);
		background: var(--surface);
	}

	.text-muted {
		color: var(--text-muted);
	}

	/* Mobile responsive */
	@media (max-width: 768px) {
		.range-bar {
			flex-direction: column;
			align-items: stretch;
		}

		.range-btn,
		.sort-btn {
			width: 100%;
		}

		.range-divider {
			width: 100%;
			height: 1px;
			margin: 0;
		}

		.summary-cards {
			grid-template-columns: 1fr;
		}

		.trend-chart {
			height: 100px;
		}

		.trend-label {
			font-size: 0.6rem;
		}

		.stats-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

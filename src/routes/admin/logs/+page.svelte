<script lang="ts">
	import { api } from '$lib/utils/api-error';

	interface LogRow {
		id: string;
		timestamp: string;
		level: string;
		method: string | null;
		path: string | null;
		status: number | null;
		latencyMs: number | null;
		userId: string | null;
		orgId: string | null;
		ip: string | null;
		userAgent: string | null;
		cfRay: string | null;
		errorMessage: string | null;
		errorStack: string | null;
		metadata: unknown | null;
	}

	let logs = $state<LogRow[]>([]);
	let total = $state(0);
	let loading = $state(false);
	let expandedIds = $state<Set<string>>(new Set());
	let autoRefresh = $state(false);
	let refreshInterval = $state<number | null>(null);

	// Filters
	let selectedLevel = $state('all');
	let pathFilter = $state('');
	let userIdFilter = $state('');
	let dateFromFilter = $state('');
	let dateToFilter = $state('');

	// Pagination
	let currentPage = $state(1);
	const pageSize = 50;

	const totalPages = $derived(Math.ceil(total / pageSize));

	async function fetchLogs() {
		loading = true;
		try {
			const params = new URLSearchParams();
			params.set('limit', String(pageSize));
			params.set('offset', String((currentPage - 1) * pageSize));

			if (selectedLevel && selectedLevel !== 'all') {
				params.set('level', selectedLevel);
			}
			if (pathFilter.trim()) {
				params.set('path', pathFilter.trim());
			}
			if (userIdFilter.trim()) {
				params.set('user_id', userIdFilter.trim());
			}
			if (dateFromFilter) {
				params.set('date_from', dateFromFilter);
			}
			if (dateToFilter) {
				params.set('date_to', dateToFilter);
			}

			const result = await api.get<{ logs: LogRow[]; total: number }>(
				`/api/admin/logs?${params.toString()}`
			);
			logs = result.logs ?? [];
			total = result.total ?? 0;
		} catch (err) {
			console.error('Failed to fetch logs', err);
			logs = [];
			total = 0;
		} finally {
			loading = false;
		}
	}

	function applyFilters() {
		currentPage = 1;
		expandedIds.clear();
		fetchLogs();
	}

	function resetFilters() {
		selectedLevel = 'all';
		pathFilter = '';
		userIdFilter = '';
		dateFromFilter = '';
		dateToFilter = '';
		currentPage = 1;
		expandedIds.clear();
		fetchLogs();
	}

	function toggleExpanded(id: string) {
		if (expandedIds.has(id)) {
			expandedIds.delete(id);
		} else {
			expandedIds.add(id);
		}
		expandedIds = expandedIds;
	}

	function formatTimestamp(isoString: string): string {
		const date = new Date(isoString);
		return date.toLocaleString('en-US', {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}

	function getLevelBadgeClass(level: string): string {
		if (level === 'info') return 'badge-info';
		if (level === 'warn') return 'badge-warn';
		if (level === 'error') return 'badge-error';
		return 'badge-info';
	}

	function getStatusClass(status: number | null): string {
		if (status === null) return '';
		if (status >= 200 && status < 300) return 'status-success';
		if (status >= 300 && status < 400) return 'status-redirect';
		if (status >= 400 && status < 500) return 'status-client-error';
		if (status >= 500) return 'status-server-error';
		return '';
	}

	function getLatencyClass(latencyMs: number | null): string {
		if (latencyMs === null) return '';
		if (latencyMs > 2000) return 'latency-critical';
		if (latencyMs > 500) return 'latency-warn';
		return '';
	}

	function isErrorRow(log: LogRow): boolean {
		return log.level === 'error' || (log.status !== null && log.status >= 500);
	}

	function toggleAutoRefresh() {
		autoRefresh = !autoRefresh;
		if (autoRefresh) {
			fetchLogs();
			refreshInterval = window.setInterval(() => {
				fetchLogs();
			}, 10000);
		} else {
			if (refreshInterval !== null) {
				clearInterval(refreshInterval);
				refreshInterval = null;
			}
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			currentPage--;
			expandedIds.clear();
			fetchLogs();
		}
	}

	function nextPage() {
		if (currentPage < totalPages) {
			currentPage++;
			expandedIds.clear();
			fetchLogs();
		}
	}

	// Initial load
	fetchLogs();
</script>

<div class="container">
	<header class="page-header">
		<h1 class="title">Application Logs</h1>
		<div class="header-actions">
			<button
				class="btn-auto-refresh"
				class:active={autoRefresh}
				onclick={toggleAutoRefresh}
				title={autoRefresh ? 'Auto-refresh enabled (10s)' : 'Enable auto-refresh'}
			>
				{#if autoRefresh}
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" />
						<circle cx="8" cy="8" r="2" fill="currentColor" />
					</svg>
					Auto-refresh
				{:else}
					<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
						<circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" />
					</svg>
					Auto-refresh
				{/if}
			</button>
		</div>
	</header>

	<div class="filter-bar">
		<div class="filter-row">
			<div class="filter-group">
				<label for="level-filter">Level</label>
				<select id="level-filter" bind:value={selectedLevel}>
					<option value="all">All Levels</option>
					<option value="info">Info</option>
					<option value="warn">Warn</option>
					<option value="error">Error</option>
				</select>
			</div>

			<div class="filter-group">
				<label for="path-filter">Path</label>
				<input
					id="path-filter"
					type="text"
					placeholder="e.g. /api/jobs"
					bind:value={pathFilter}
				/>
			</div>

			<div class="filter-group">
				<label for="user-filter">User ID</label>
				<input id="user-filter" type="text" placeholder="User ID" bind:value={userIdFilter} />
			</div>
		</div>

		<div class="filter-row">
			<div class="filter-group">
				<label for="date-from-filter">From</label>
				<input id="date-from-filter" type="datetime-local" bind:value={dateFromFilter} />
			</div>

			<div class="filter-group">
				<label for="date-to-filter">To</label>
				<input id="date-to-filter" type="datetime-local" bind:value={dateToFilter} />
			</div>

			<div class="filter-actions">
				<button class="btn-apply" onclick={applyFilters}>Apply</button>
				<button class="btn-reset" onclick={resetFilters}>Reset</button>
			</div>
		</div>
	</div>

	<div class="table-container">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>Loading logs...</p>
			</div>
		{:else if logs.length === 0}
			<div class="empty-state">
				<p>No logs found matching the current filters.</p>
			</div>
		{:else}
			<table class="logs-table">
				<thead>
					<tr>
						<th>Timestamp</th>
						<th>Level</th>
						<th>Method</th>
						<th>Path</th>
						<th>Status</th>
						<th>Latency</th>
						<th>User</th>
					</tr>
				</thead>
				<tbody>
					{#each logs as log (log.id)}
						<tr class="log-row" class:error-row={isErrorRow(log)} onclick={() => toggleExpanded(log.id)}>
							<td class="timestamp">{formatTimestamp(log.timestamp)}</td>
							<td>
								<span class="badge {getLevelBadgeClass(log.level)}">{log.level}</span>
							</td>
							<td class="method">{log.method ?? '-'}</td>
							<td class="path">{log.path ?? '-'}</td>
							<td>
								{#if log.status !== null}
									<span class="status {getStatusClass(log.status)}">{log.status}</span>
								{:else}
									-
								{/if}
							</td>
							<td>
								{#if log.latencyMs !== null}
									<span class="latency {getLatencyClass(log.latencyMs)}">{log.latencyMs}ms</span>
								{:else}
									-
								{/if}
							</td>
							<td class="user">{log.userId ? log.userId.slice(0, 8) : '-'}</td>
						</tr>
						{#if expandedIds.has(log.id)}
							<tr class="detail-row">
								<td colspan="7">
									<div class="detail-content">
										{#if log.errorMessage}
											<div class="detail-section">
												<strong>Error Message:</strong>
												<pre>{log.errorMessage}</pre>
											</div>
										{/if}

										{#if log.errorStack}
											<div class="detail-section">
												<strong>Stack Trace:</strong>
												<pre>{log.errorStack}</pre>
											</div>
										{/if}

										{#if log.metadata}
											<div class="detail-section">
												<strong>Metadata:</strong>
												<pre>{JSON.stringify(log.metadata, null, 2)}</pre>
											</div>
										{/if}

										<div class="detail-section detail-grid">
											<div class="detail-item">
												<strong>ID:</strong>
												<span>{log.id}</span>
											</div>
											{#if log.ip}
												<div class="detail-item">
													<strong>IP:</strong>
													<span>{log.ip}</span>
												</div>
											{/if}
											{#if log.cfRay}
												<div class="detail-item">
													<strong>CF Ray:</strong>
													<span>{log.cfRay}</span>
												</div>
											{/if}
											{#if log.orgId}
												<div class="detail-item">
													<strong>Org ID:</strong>
													<span>{log.orgId}</span>
												</div>
											{/if}
											{#if log.userAgent}
												<div class="detail-item full-width">
													<strong>User Agent:</strong>
													<span>{log.userAgent}</span>
												</div>
											{/if}
										</div>
									</div>
								</td>
							</tr>
						{/if}
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

	{#if !loading && logs.length > 0}
		<div class="pagination">
			<button class="btn-page" onclick={prevPage} disabled={currentPage === 1}>Previous</button>
			<span class="page-info">Page {currentPage} of {totalPages} ({total} total)</span>
			<button class="btn-page" onclick={nextPage} disabled={currentPage >= totalPages}>Next</button>
		</div>
	{/if}
</div>

<style>
	.container {
		width: 100%;
		max-width: 1600px;
		margin: 0 auto;
		padding: 16px;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 20px;
		flex-wrap: wrap;
		gap: 12px;
	}

	.title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
		margin: 0;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.btn-auto-refresh {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.btn-auto-refresh:hover {
		background: var(--surface-hover);
		border-color: var(--accent);
	}

	.btn-auto-refresh.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.filter-bar {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 16px;
		margin-bottom: 20px;
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.filter-row {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		align-items: flex-end;
	}

	.filter-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex: 1;
		min-width: 140px;
	}

	.filter-group label {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.filter-group input,
	.filter-group select {
		min-height: 48px;
		padding: 0 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 0.95rem;
	}

	.filter-group input:focus,
	.filter-group select:focus {
		outline: none;
		border-color: var(--accent);
	}

	.filter-actions {
		display: flex;
		gap: 10px;
		align-items: flex-end;
	}

	.btn-apply,
	.btn-reset {
		min-height: 48px;
		padding: 0 20px;
		border-radius: 8px;
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.btn-apply {
		background: var(--accent);
		color: var(--accent-text);
		border: 1px solid var(--accent);
	}

	.btn-apply:hover {
		opacity: 0.9;
	}

	.btn-reset {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}

	.btn-reset:hover {
		background: var(--surface-hover);
	}

	.table-container {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		overflow-x: auto;
		margin-bottom: 20px;
	}

	.logs-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.logs-table thead {
		background: var(--bg);
		border-bottom: 1px solid var(--border);
	}

	.logs-table th {
		padding: 12px 16px;
		text-align: left;
		font-weight: 700;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		font-size: 0.75rem;
		white-space: nowrap;
	}

	.logs-table td {
		padding: 12px 16px;
		border-bottom: 1px solid var(--border);
	}

	.log-row {
		cursor: pointer;
		transition: background 0.2s;
	}

	.log-row:hover {
		background: var(--surface-hover);
	}

	.error-row {
		background: rgba(239, 68, 68, 0.05);
	}

	.error-row:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	.timestamp {
		white-space: nowrap;
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-size: 0.85rem;
	}

	.method {
		font-weight: 600;
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-size: 0.85rem;
	}

	.path {
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-size: 0.85rem;
		max-width: 300px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.user {
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-size: 0.85rem;
	}

	.badge {
		display: inline-block;
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.badge-info {
		background: rgba(148, 163, 184, 0.2);
		color: rgb(148, 163, 184);
	}

	.badge-warn {
		background: rgba(250, 204, 21, 0.2);
		color: rgb(250, 204, 21);
	}

	.badge-error {
		background: rgba(239, 68, 68, 0.2);
		color: rgb(239, 68, 68);
	}

	.status {
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-weight: 700;
		font-size: 0.85rem;
	}

	.status-success {
		color: rgb(34, 197, 94);
	}

	.status-redirect {
		color: rgb(59, 130, 246);
	}

	.status-client-error {
		color: rgb(250, 204, 21);
	}

	.status-server-error {
		color: rgb(239, 68, 68);
	}

	.latency {
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-size: 0.85rem;
		padding: 2px 6px;
		border-radius: 4px;
	}

	.latency-warn {
		background: rgba(250, 204, 21, 0.2);
		color: rgb(250, 204, 21);
	}

	.latency-critical {
		background: rgba(239, 68, 68, 0.2);
		color: rgb(239, 68, 68);
	}

	.detail-row {
		background: var(--bg);
	}

	.detail-row td {
		padding: 20px;
	}

	.detail-content {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.detail-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.detail-section strong {
		color: var(--text-muted);
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.detail-section pre {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 12px;
		overflow-x: auto;
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-size: 0.85rem;
		line-height: 1.5;
		margin: 0;
	}

	.detail-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 12px;
	}

	.detail-item {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.detail-item.full-width {
		grid-column: 1 / -1;
	}

	.detail-item span {
		font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Consolas', monospace;
		font-size: 0.85rem;
		word-break: break-all;
	}

	.loading-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		color: var(--text-muted);
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 4px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
		margin-bottom: 12px;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 16px;
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}

	.btn-page {
		min-height: 48px;
		padding: 0 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			background 0.2s,
			border-color 0.2s;
	}

	.btn-page:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--accent);
	}

	.btn-page:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.page-info {
		font-size: 0.9rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	@media (max-width: 768px) {
		.page-header {
			flex-direction: column;
			align-items: stretch;
		}

		.header-actions {
			justify-content: stretch;
		}

		.btn-auto-refresh {
			width: 100%;
			justify-content: center;
		}

		.filter-row {
			flex-direction: column;
		}

		.filter-group {
			width: 100%;
		}

		.filter-actions {
			width: 100%;
		}

		.btn-apply,
		.btn-reset {
			flex: 1;
		}

		.logs-table {
			font-size: 0.85rem;
		}

		.logs-table th,
		.logs-table td {
			padding: 10px 12px;
		}

		.pagination {
			flex-direction: column;
		}

		.btn-page {
			width: 100%;
		}
	}
</style>

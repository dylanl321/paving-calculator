<script lang="ts">
	interface AuditLogEntry {
		id: string;
		actor_user_id: string | null;
		actor_name: string | null;
		org_id: string;
		resource_type: string;
		resource_id: string;
		action: string;
		old_value: string | null;
		new_value: string | null;
		ip_address: string | null;
		user_agent: string | null;
		created_at: number;
	}

	interface User {
		id: string;
		name: string;
	}

	interface ActivityResponse {
		entries: AuditLogEntry[];
		next_cursor: number | null;
		users: User[];
	}

	let { siteId }: { siteId: string } = $props();

	let entries = $state<AuditLogEntry[]>([]);
	let users = $state<User[]>([]);
	let nextCursor = $state<number | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let resourceTypeFilter = $state<string | null>(null);
	let actorUserIdFilter = $state<string | null>(null);
	let loadMoreTrigger = $state<HTMLDivElement | null>(null);

	async function loadActivity(append = false) {
		loading = true;
		error = null;

		try {
			const params = new URLSearchParams();
			if (resourceTypeFilter) params.set('resource_type', resourceTypeFilter);
			if (actorUserIdFilter) params.set('actor_user_id', actorUserIdFilter);
			if (append && nextCursor) params.set('before', String(nextCursor));

			const res = await fetch(`/api/job-sites/${siteId}/activity?${params}`, {
				credentials: 'include'
			});

			if (!res.ok) throw new Error('Failed to load activity');

			const data = (await res.json()) as ActivityResponse;

			if (append) {
				entries = [...entries, ...data.entries];
			} else {
				entries = data.entries;
			}

			nextCursor = data.next_cursor;

			const existingUserIds = new Set(users.map((u) => u.id));
			for (const user of data.users) {
				if (!existingUserIds.has(user.id)) {
					users.push(user);
					existingUserIds.add(user.id);
				}
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Unknown error';
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		loadActivity();
	});

	$effect(() => {
		if (!loadMoreTrigger || !nextCursor) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !loading && nextCursor) {
					loadActivity(true);
				}
			},
			{ rootMargin: '100px' }
		);

		observer.observe(loadMoreTrigger);

		return () => {
			observer.disconnect();
		};
	});

	function formatRelativeTime(timestamp: number): string {
		const now = Math.floor(Date.now() / 1000);
		const diff = now - timestamp;

		if (diff < 60) return 'just now';
		if (diff < 3600) {
			const mins = Math.floor(diff / 60);
			return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`;
		}
		if (diff < 86400) {
			const hours = Math.floor(diff / 3600);
			return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
		}
		if (diff < 604800) {
			const days = Math.floor(diff / 86400);
			return `${days} ${days === 1 ? 'day' : 'days'} ago`;
		}
		if (diff < 2592000) {
			const weeks = Math.floor(diff / 604800);
			return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
		}

		const date = new Date(timestamp * 1000);
		return date.toLocaleDateString();
	}

	function getResourceTypeIcon(resourceType: string): string {
		const icons: Record<string, string> = {
			job_site: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
			job_site_config: 'M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
			equipment:
				'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
			daily_log: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6',
			load_entry: 'M1 3h15v13H1z M16 8h4l3 3v5h-7V8z M5.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'
		};
		return icons[resourceType] || 'M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z';
	}

	function getResourceTypeColor(resourceType: string): string {
		const colors: Record<string, string> = {
			job_site: '#3b82f6',
			job_site_config: '#8b5cf6',
			equipment: '#f59e0b',
			daily_log: '#10b981',
			load_entry: '#06b6d4'
		};
		return colors[resourceType] || '#6b7280';
	}

	function getActivityDescription(entry: AuditLogEntry): string {
		const actor = entry.actor_name || 'System';

		if (entry.action === 'create' && entry.resource_type === 'job_site') {
			return `${actor} created this project`;
		}
		if (entry.action === 'update' && entry.resource_type === 'job_site_config') {
			return `${actor} updated project configuration`;
		}
		if (entry.action === 'update' && entry.resource_type === 'job_site') {
			return `${actor} updated project details`;
		}
		if (entry.action === 'create' && entry.resource_type === 'equipment') {
			return `${actor} added equipment`;
		}
		if (entry.action === 'delete' && entry.resource_type === 'equipment') {
			return `${actor} removed equipment`;
		}
		if (entry.action === 'create' && entry.resource_type === 'daily_log') {
			return `${actor} created a daily log`;
		}
		if (entry.action === 'update' && entry.resource_type === 'daily_log') {
			return `${actor} updated a daily log`;
		}
		if (entry.action === 'create' && entry.resource_type === 'load_entry') {
			return `${actor} logged a load`;
		}

		if (entry.old_value && entry.new_value) {
			try {
				const oldVal = JSON.parse(entry.old_value);
				const newVal = JSON.parse(entry.new_value);

				for (const key in newVal) {
					if (oldVal[key] !== newVal[key]) {
						const fieldName = key.replace(/_/g, ' ');
						return `${actor} updated ${fieldName} from ${oldVal[key]} to ${newVal[key]}`;
					}
				}
			} catch {
				// Fall through to default
			}
		}

		const actionText = entry.action === 'create' ? 'created' : entry.action === 'delete' ? 'deleted' : 'updated';
		const resourceText = entry.resource_type.replace(/_/g, ' ');
		return `${actor} ${actionText} ${resourceText}`;
	}

	function handleFilterChange() {
		entries = [];
		nextCursor = null;
		loadActivity();
	}

	const resourceTypeOptions = [
		{ value: null, label: 'All types' },
		{ value: 'job_site', label: 'Project' },
		{ value: 'job_site_config', label: 'Configuration' },
		{ value: 'equipment', label: 'Equipment' },
		{ value: 'daily_log', label: 'Daily Log' },
		{ value: 'load_entry', label: 'Loads' }
	];
</script>

<section class="section">
	<div class="filters">
		<div class="filter-group">
			<label for="resource_type_filter">Activity Type</label>
			<select
				id="resource_type_filter"
				bind:value={resourceTypeFilter}
				onchange={handleFilterChange}
			>
				{#each resourceTypeOptions as opt}
					<option value={opt.value}>{opt.label}</option>
				{/each}
			</select>
		</div>

		{#if users.length > 1}
			<div class="filter-group">
				<label for="actor_filter">User</label>
				<select id="actor_filter" bind:value={actorUserIdFilter} onchange={handleFilterChange}>
					<option value={null}>All users</option>
					{#each users as user}
						<option value={user.id}>{user.name}</option>
					{/each}
				</select>
			</div>
		{/if}
	</div>

	{#if error}
		<div class="error-state">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<circle cx="12" cy="12" r="10"></circle>
				<line x1="12" y1="8" x2="12" y2="12"></line>
				<line x1="12" y1="16" x2="12.01" y2="16"></line>
			</svg>
			<p>{error}</p>
		</div>
	{:else if !loading && entries.length === 0}
		<div class="empty-state">
			<div class="icon-circle">
				<svg
					width="56"
					height="56"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"></path>
				</svg>
			</div>
			<h4>No activity recorded yet</h4>
			<p>Actions performed on this project will appear here</p>
		</div>
	{:else}
		<div class="timeline">
			{#each entries as entry (entry.id)}
				<div class="timeline-entry">
					<div class="timeline-marker" style="background-color: {getResourceTypeColor(entry.resource_type)}">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d={getResourceTypeIcon(entry.resource_type)}></path>
						</svg>
					</div>
					<div class="timeline-content">
						<div class="timeline-header">
							<div class="timeline-description">{getActivityDescription(entry)}</div>
							<div class="timeline-time">{formatRelativeTime(entry.created_at)}</div>
						</div>
						<div class="timeline-actor">{entry.actor_name || 'System'}</div>
					</div>
				</div>
			{/each}
		</div>

		{#if nextCursor}
			<div bind:this={loadMoreTrigger} class="load-more-trigger">
				{#if loading}
					<div class="loading-spinner">Loading more...</div>
				{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.filters {
		display: flex;
		gap: 16px;
		margin-bottom: 24px;
		flex-wrap: wrap;
	}

	.filter-group {
		flex: 1;
		min-width: 200px;
	}

	.filter-group label {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
		margin-bottom: 6px;
	}

	.filter-group select {
		width: 100%;
		min-height: 48px;
		padding: 0 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
	}

	.filter-group select:focus {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.empty-state {
		text-align: center;
		padding: 48px 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.empty-state .icon-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: var(--background);
		border: 1px solid var(--border);
		margin-bottom: 16px;
	}

	.empty-state svg {
		color: var(--accent);
	}

	.empty-state h4 {
		margin: 0 0 8px;
		font-size: 1rem;
		color: var(--text);
		font-weight: 500;
	}

	.empty-state p {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		max-width: 350px;
	}

	.error-state {
		text-align: center;
		padding: 48px 16px;
		display: flex;
		flex-direction: column;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
	}

	.error-state svg {
		color: #ef4444;
		margin-bottom: 16px;
	}

	.timeline {
		position: relative;
		padding-left: 32px;
	}

	.timeline::before {
		content: '';
		position: absolute;
		left: 15px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--border);
	}

	.timeline-entry {
		position: relative;
		display: flex;
		gap: 16px;
		margin-bottom: 24px;
	}

	.timeline-marker {
		position: absolute;
		left: -25px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 0 0 4px var(--background);
	}

	.timeline-content {
		flex: 1;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px 16px;
	}

	.timeline-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 6px;
	}

	.timeline-description {
		font-size: 0.95rem;
		color: var(--text);
		line-height: 1.4;
	}

	.timeline-time {
		font-size: 0.8rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.timeline-actor {
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.load-more-trigger {
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.loading-spinner {
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	@media (max-width: 640px) {
		.timeline-header {
			flex-direction: column;
			gap: 4px;
		}

		.timeline-time {
			align-self: flex-start;
		}
	}
</style>

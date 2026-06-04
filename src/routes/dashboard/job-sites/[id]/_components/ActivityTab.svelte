<script lang="ts">
	import { api } from '$lib/utils/api-error';

	let { jobSiteId }: { jobSiteId: string } = $props();

	interface AuditEntry {
		id: string;
		actor_user_id: string | null;
		actor_name: string | null;
		resource_type: string;
		resource_id: string;
		action: string;
		old_value: string | null;
		new_value: string | null;
		created_at: number;
	}

	interface Member {
		id: string;
		name: string;
	}

	let entries = $state<AuditEntry[]>([]);
	let members = $state<Member[]>([]);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);
	let nextCursor = $state<number | null>(null);
	let hasMore = $state(false);

	// Filters
	let filterType = $state('all');
	let filterUser = $state('all');

	const typeFilters = [
		{ value: 'all', label: 'All' },
		{ value: 'job_site', label: 'Project' },
		{ value: 'config', label: 'Config' },
		{ value: 'equipment', label: 'Equipment' },
		{ value: 'daily_log', label: 'Daily Log' },
		{ value: 'load', label: 'Loads' },
		{ value: 'milestone', label: 'Schedule' }
	];

	function resourceTypeToLabel(type: string): string {
		const map: Record<string, string> = {
			job_site: 'Project',
			config: 'Config',
			equipment: 'Equipment',
			daily_log: 'Daily Log',
			load: 'Load',
			milestone: 'Milestone'
		};
		return map[type] || type;
	}

	function describeAction(entry: AuditEntry): string {
		const rt = entry.resource_type;
		const act = entry.action;

		// Try to show field-level detail for config updates
		if (rt === 'config' && act === 'update' && entry.old_value && entry.new_value) {
			try {
				const oldObj = JSON.parse(entry.old_value);
				const newObj = JSON.parse(entry.new_value);
				const changed: string[] = [];
				const fieldLabels: Record<string, string> = {
					lane_width_ft: 'lane width',
					target_thickness_in: 'target thickness',
					num_lanes: 'lane count',
					total_length_ft: 'project length',
					mix_type: 'mix type',
					tack_type: 'tack type',
					road_type: 'road type',
					scope_of_work: 'scope',
					target_spread_rate: 'spread rate',
					target_tack_rate: 'tack rate',
					cost_per_ton: 'cost/ton',
					cost_per_sy: 'cost/SY',
					total_contract_value: 'contract value'
				};
				for (const key of Object.keys(newObj)) {
					if (oldObj[key] !== newObj[key] && fieldLabels[key]) {
						const lbl = fieldLabels[key];
						changed.push(`changed ${lbl} from ${oldObj[key]} to ${newObj[key]}`);
					}
				}
				if (changed.length === 1) return changed[0];
				if (changed.length > 1) return `updated config (${changed.length} fields)`;
			} catch {
				// fall through
			}
		}

		const descriptions: Record<string, Record<string, string>> = {
			job_site: { create: 'created the project', update: 'updated project details', delete: 'deleted the project' },
			config: { create: 'set up project config', update: 'updated project config', delete: 'cleared project config' },
			equipment: { create: 'added equipment', update: 'updated equipment', delete: 'removed equipment' },
			daily_log: { create: 'created a daily log', update: 'updated daily log', close: 'closed daily log', unlock: 'unlocked daily log', delete: 'deleted daily log' },
			load: { create: 'recorded a load', update: 'updated a load', delete: 'removed a load' },
			milestone: { create: 'added a milestone', update: 'updated a milestone', delete: 'removed a milestone', complete: 'completed a milestone' }
		};

		return descriptions[rt]?.[act] ?? `${act} ${rt.replace('_', ' ')}`;
	}

	function relativeTime(ts: number): string {
		const now = Math.floor(Date.now() / 1000);
		const diff = now - ts;
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
		if (diff < 172800) return 'yesterday';
		if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
		const d = new Date(ts * 1000);
		return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function initials(name: string | null): string {
		if (!name) return '?';
		const parts = name.trim().split(/\s+/);
		if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
		return name.slice(0, 2).toUpperCase();
	}

	// Generate a consistent color from actor id/name
	function actorColor(actorId: string | null, name: string | null): string {
		const seed = actorId || name || '?';
		let hash = 0;
		for (let i = 0; i < seed.length; i++) {
			hash = seed.charCodeAt(i) + ((hash << 5) - hash);
		}
		const colors = ['#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];
		return colors[Math.abs(hash) % colors.length];
	}

	async function loadEntries(reset = false) {
		if (loading || loadingMore) return;
		if (reset) {
			loading = true;
			entries = [];
			nextCursor = null;
			hasMore = false;
			members = [];
		} else {
			loadingMore = true;
		}
		error = null;

		try {
			const params = new URLSearchParams({ limit: '30' });
			if (filterType !== 'all') params.set('resource_type', filterType);
			if (filterUser !== 'all') params.set('actor_user_id', filterUser);
			if (!reset && nextCursor) params.set('before', String(nextCursor));

			const data = await api.get(`/api/job-sites/${jobSiteId}/activity?${params}`) as { entries: AuditEntry[]; next_cursor: number | null; members: Member[] };

			entries = reset ? data.entries : [...entries, ...data.entries];
			nextCursor = data.next_cursor;
			hasMore = data.next_cursor !== null;
			if (data.members?.length) {
				// Merge members without duplicates
				const seen = new Set(members.map((m) => m.id));
				for (const m of data.members) {
					if (!seen.has(m.id)) {
						members = [...members, m];
						seen.add(m.id);
					}
				}
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'Unknown error';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	// Sentinel for infinite scroll
	let sentinel = $state<HTMLDivElement | null>(null);
	let observer: IntersectionObserver | null = null;

	$effect(() => {
		if (sentinel) {
			observer?.disconnect();
			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && hasMore && !loadingMore) {
						loadEntries(false);
					}
				},
				{ threshold: 0.1 }
			);
			observer.observe(sentinel);
		}
		return () => observer?.disconnect();
	});

	// Reload when filters change
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		filterType;
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		filterUser;
		loadEntries(true);
	});
</script>

<div class="activity-tab">
	<div class="filters">
		<div class="type-filters">
			{#each typeFilters as f}
				<button
					class="filter-pill"
					class:active={filterType === f.value}
					onclick={() => (filterType = f.value)}
				>
					{f.label}
				</button>
			{/each}
		</div>
		{#if members.length > 0}
			<select class="user-filter" bind:value={filterUser}>
				<option value="all">All members</option>
				{#each members as m}
					<option value={m.id}>{m.name}</option>
				{/each}
			</select>
		{/if}
	</div>

	{#if loading}
		<div class="state-box">
			<div class="spinner"></div>
			<span>Loading activity...</span>
		</div>
	{:else if error}
		<div class="state-box error">
			<span>Failed to load: {error}</span>
			<button class="retry-btn" onclick={() => loadEntries(true)}>Retry</button>
		</div>
	{:else if entries.length === 0}
		<div class="state-box empty">
			<span class="empty-icon">📋</span>
			<span>No activity recorded yet</span>
			<span class="empty-sub">Changes to this project will appear here</span>
		</div>
	{:else}
		<div class="timeline">
			{#each entries as entry (entry.id)}
				<div class="timeline-item">
					<div
						class="avatar"
						style="background: {actorColor(entry.actor_user_id, entry.actor_name)}"
					>
						{initials(entry.actor_name)}
					</div>
					<div class="item-body">
						<div class="item-main">
							<span class="actor">{entry.actor_name || 'System'}</span>
							<span class="action">{describeAction(entry)}</span>
						</div>
						<div class="item-meta">
							<span class="type-badge">{resourceTypeToLabel(entry.resource_type)}</span>
							<span class="timestamp">{relativeTime(entry.created_at)}</span>
						</div>
					</div>
				</div>
			{/each}

			{#if loadingMore}
				<div class="load-more-row">
					<div class="spinner small"></div>
				</div>
			{/if}

			<div bind:this={sentinel} class="sentinel"></div>
		</div>
	{/if}
</div>

<style>
	.activity-tab {
		display: flex;
		flex-direction: column;
		gap: 0;
		min-height: 200px;
	}

	.filters {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 12px 16px;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
	}

	.type-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.filter-pill {
		padding: 6px 12px;
		min-height: 36px;
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: transparent;
		color: rgba(255, 255, 255, 0.6);
		font-size: 13px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.filter-pill:hover {
		border-color: rgba(242, 192, 55, 0.4);
		color: rgba(255, 255, 255, 0.85);
	}

	.filter-pill.active {
		background: #f2c037;
		border-color: #f2c037;
		color: #1a2530;
		font-weight: 600;
	}

	.user-filter {
		height: 36px;
		padding: 0 10px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		color: rgba(255, 255, 255, 0.8);
		font-size: 13px;
		cursor: pointer;
		max-width: 200px;
	}

	.state-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 48px 24px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 14px;
	}

	.state-box.error {
		color: #f87171;
	}

	.state-box.empty {
		gap: 6px;
	}

	.empty-icon {
		font-size: 32px;
		margin-bottom: 8px;
	}

	.empty-sub {
		font-size: 12px;
		opacity: 0.6;
	}

	.retry-btn {
		margin-top: 8px;
		padding: 8px 16px;
		min-height: 36px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 8px;
		color: inherit;
		cursor: pointer;
		font-size: 13px;
	}

	.timeline {
		display: flex;
		flex-direction: column;
		padding: 8px 0;
	}

	.timeline-item {
		display: flex;
		gap: 12px;
		padding: 12px 16px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		align-items: flex-start;
		transition: background 0.1s;
	}

	.timeline-item:hover {
		background: rgba(255, 255, 255, 0.02);
	}

	.avatar {
		flex-shrink: 0;
		width: 36px;
		height: 36px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 12px;
		font-weight: 700;
		color: #fff;
		margin-top: 2px;
	}

	.item-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.item-main {
		font-size: 14px;
		line-height: 1.4;
		color: rgba(255, 255, 255, 0.9);
	}

	.actor {
		font-weight: 600;
		margin-right: 4px;
	}

	.action {
		color: rgba(255, 255, 255, 0.7);
	}

	.item-meta {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.type-badge {
		font-size: 11px;
		padding: 2px 6px;
		border-radius: 4px;
		background: rgba(242, 192, 55, 0.15);
		color: #f2c037;
		font-weight: 500;
	}

	.timestamp {
		font-size: 12px;
		color: rgba(255, 255, 255, 0.35);
	}

	.load-more-row {
		display: flex;
		justify-content: center;
		padding: 16px;
	}

	.sentinel {
		height: 4px;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid rgba(255, 255, 255, 0.1);
		border-top-color: #f2c037;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	.spinner.small {
		width: 18px;
		height: 18px;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>

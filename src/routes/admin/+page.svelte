<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const stats = $derived(data.stats);

	function formatDate(ts: number): string {
		return new Date(ts * 1000).toLocaleDateString();
	}

	function formatDateTime(ts: number): string {
		return new Date(ts * 1000).toLocaleString();
	}

	function statusLabel(status: string): string {
		if (status === 'failed') return 'Failed';
		if (status === 'skipped_no_key') return 'Skipped (no key)';
		return status;
	}
</script>

<div class="admin-overview">
	<header class="admin-page-header">
		<div>
			<h1 class="admin-page-title">Overview</h1>
			<p class="admin-page-subtitle">Platform health across organizations, users, and email.</p>
		</div>
	</header>

	<div class="kpi-grid">
		<a href="/admin/orgs" class="kpi">
			<span class="kpi-num">{stats.totalOrgs}</span>
			<span class="kpi-cap">Organizations</span>
		</a>
		<a href="/admin/users" class="kpi">
			<span class="kpi-num">{stats.totalUsers}</span>
			<span class="kpi-cap">Total Users</span>
		</a>
		<div class="kpi">
			<span class="kpi-num">{stats.activeUsers}</span>
			<span class="kpi-cap">Active Users</span>
		</div>
		<div class="kpi">
			<span class="kpi-num">{stats.totalJobSites}</span>
			<span class="kpi-cap">Job Sites</span>
		</div>
		<div class="kpi" class:warn={stats.unverifiedUsers > 0}>
			<span class="kpi-num">{stats.unverifiedUsers}</span>
			<span class="kpi-cap">Unverified Users</span>
		</div>
		<a href="/admin/emails" class="kpi" class:bad={stats.failedEmails > 0}>
			<span class="kpi-num">{stats.failedEmails}</span>
			<span class="kpi-cap">Failed Emails</span>
		</a>
	</div>

	<div class="panels">
		<section class="panel">
			<div class="panel-head">
				<h2>Recent Users</h2>
				<a href="/admin/users">View all</a>
			</div>
			{#if data.recentUsers.length === 0}
				<p class="empty">No users yet.</p>
			{:else}
				<ul class="activity-list">
					{#each data.recentUsers as u}
						<li>
							<a href="/admin/users/{u.id}" class="activity-main">{u.name}</a>
							<span class="activity-sub">{u.email}</span>
							<span class="activity-meta">{formatDate(u.created_at)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Recent Organizations</h2>
				<a href="/admin/orgs">View all</a>
			</div>
			{#if data.recentOrgs.length === 0}
				<p class="empty">No organizations yet.</p>
			{:else}
				<ul class="activity-list">
					{#each data.recentOrgs as o}
						<li>
							<a href="/admin/orgs/{o.id}" class="activity-main">{o.name}</a>
							<span class="activity-sub">{o.member_count} member{o.member_count === 1 ? '' : 's'}</span>
							<span class="activity-meta">{formatDate(o.created_at)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Recent Failed Emails</h2>
				<a href="/admin/emails">Email log</a>
			</div>
			{#if data.recentFailedEmails.length === 0}
				<p class="empty">No failed sends. 🎉</p>
			{:else}
				<ul class="activity-list">
					{#each data.recentFailedEmails as e}
						<li>
							<span class="activity-main">{e.to_email}</span>
							<span class="activity-sub">{e.type} · {statusLabel(e.status)}</span>
							<span class="activity-meta">{formatDateTime(e.created_at)}</span>
							{#if e.error}
								<span class="activity-error" title={e.error}>{e.error}</span>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Orgs Needing Attention</h2>
			</div>
			{#if data.needingAttention.length === 0}
				<p class="empty">All organizations have an owner and members.</p>
			{:else}
				<ul class="activity-list">
					{#each data.needingAttention as o}
						<li>
							<a href="/admin/orgs/{o.id}" class="activity-main">{o.name}</a>
							<span class="activity-sub">
								{o.member_count === 0
									? 'No members'
									: o.owner_count === 0
										? 'No owner'
										: 'Needs review'}
							</span>
							<span class="activity-meta">{formatDate(o.created_at)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="panel">
			<div class="panel-head">
				<h2>Document Feedback</h2>
				<span class="panel-hint">What users uploaded that we don't support yet</span>
			</div>
			{#if data.docFeedbackGroups.length === 0}
				<p class="empty">No document feedback submitted yet.</p>
			{:else}
				<ul class="activity-list">
					{#each data.docFeedbackGroups as fb}
						<li>
							<span class="activity-main">{fb.user_corrected_type}</span>
							<span class="activity-sub">{fb.count} submission{fb.count === 1 ? '' : 's'}</span>
							<span class="activity-meta">{formatDate(fb.last_seen)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</div>

<style>
	.admin-overview {
		width: 100%;
	}

	.kpi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.kpi {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.5rem;
		text-decoration: none;
		transition: background 0.15s ease;
	}

	a.kpi:hover {
		background: var(--surface-hover);
	}

	.kpi-num {
		font-size: 2.25rem;
		font-weight: 700;
		color: var(--accent);
		line-height: 1;
	}

	.kpi-cap {
		font-size: 0.95rem;
		color: var(--text-muted);
	}

	.kpi.warn .kpi-num {
		color: var(--accent);
	}

	.kpi.bad .kpi-num {
		color: var(--bad);
	}

	.panels {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 1.5rem;
	}

	.panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 1.25rem 1.5rem;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
	}

	.panel-head h2 {
		font-size: 1.15rem;
		margin: 0;
		color: var(--text);
	}

	.panel-head a {
		font-size: 0.85rem;
		color: var(--accent);
		text-decoration: none;
	}

	.panel-head a:hover {
		text-decoration: underline;
	}

	.panel-hint {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.activity-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}

	.activity-list li {
		display: grid;
		grid-template-columns: 1fr auto;
		grid-template-areas:
			'main meta'
			'sub meta'
			'err err';
		gap: 0.1rem 0.75rem;
		padding: 0.65rem 0;
		border-top: 1px solid var(--border);
	}

	.activity-list li:first-child {
		border-top: none;
	}

	.activity-main {
		grid-area: main;
		font-weight: 600;
		color: var(--text);
		text-decoration: none;
	}

	a.activity-main:hover {
		color: var(--accent);
	}

	.activity-sub {
		grid-area: sub;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.activity-meta {
		grid-area: meta;
		font-size: 0.8rem;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.activity-error {
		grid-area: err;
		font-size: 0.8rem;
		color: var(--bad);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 0.2rem;
	}

	.empty {
		color: var(--text-muted);
		padding: 0.5rem 0;
		margin: 0;
	}
</style>

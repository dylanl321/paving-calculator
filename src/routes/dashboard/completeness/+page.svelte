<script lang="ts">
	import type { PageData } from './$types';
	import { ClipboardCheck, AlertTriangle, XCircle, CheckCircle2, ChevronRight } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	const completeness = $derived(data.completeness);
	const summary = $derived(completeness?.summary);
	const sites = $derived(completeness?.sites ?? []);

	// Friendly labels for fields
	const FIELD_LABELS: Record<string, string> = {
		name: 'Job name',
		status: 'Status',
		road_type: 'Road type',
		num_lanes: 'Number of lanes',
		lane_width_ft: 'Lane width',
		total_length_ft: 'Total length',
		scope_of_work: 'Scope of work',
		mix_type: 'Mix type',
		target_thickness_in: 'Target thickness',
		target_spread_rate: 'Spread rate',
		tack_type: 'Tack type',
		target_tack_rate: 'Tack rate',
		num_lifts: 'Number of lifts',
		total_tonnage: 'Total tonnage',
		coordinates: 'Location coordinates',
		est_start_date: 'Start date',
		completion_date: 'Completion date',
		customer_name: 'Customer name',
		project_manager: 'Project manager',
		has_daily_log: 'Daily log entry'
	};

	function fieldLabel(key: string): string {
		return FIELD_LABELS[key] ?? key.replace(/_/g, ' ');
	}

	// Deep link: required fields go to config tab, optional scheduling/meta fields go to overview
	const CONFIG_FIELDS = new Set([
		'road_type', 'num_lanes', 'lane_width_ft', 'total_length_ft',
		'scope_of_work', 'mix_type', 'target_thickness_in', 'target_spread_rate',
		'tack_type', 'target_tack_rate', 'num_lifts', 'total_tonnage'
	]);

	const LOG_FIELDS = new Set(['has_daily_log']);
	const SCHEDULE_FIELDS = new Set(['est_start_date', 'completion_date']);
	const LOCATION_FIELDS = new Set(['coordinates']);

	function deepLink(siteId: string, field: string): string {
		if (CONFIG_FIELDS.has(field)) return `/dashboard/job-sites/${siteId}?tab=configuration`;
		if (LOG_FIELDS.has(field)) return `/dashboard/job-sites/${siteId}?tab=daily-log`;
		if (SCHEDULE_FIELDS.has(field)) return `/dashboard/job-sites/${siteId}?tab=schedule`;
		if (LOCATION_FIELDS.has(field)) return `/dashboard/job-sites/${siteId}?tab=overview`;
		// customer_name, project_manager, name, status → overview
		return `/dashboard/job-sites/${siteId}?tab=overview`;
	}

	// Org-wide score from avg_score
	const orgScore = $derived(summary?.avg_score ?? 0);

	function scoreColor(score: number): string {
		if (score >= 90) return 'var(--color-success, #22c55e)';
		if (score >= 60) return 'var(--color-warning, #f59e0b)';
		return 'var(--color-danger, #ef4444)';
	}

	function statusIcon(status: string) {
		if (status === 'complete') return CheckCircle2;
		if (status === 'needs-attention') return AlertTriangle;
		return XCircle;
	}

	function statusLabel(status: string): string {
		if (status === 'complete') return 'Complete';
		if (status === 'needs-attention') return 'Needs attention';
		return 'Incomplete';
	}

	// Expand/collapse per site
	let expanded = $state<Record<string, boolean>>({});

	function toggle(id: string) {
		expanded[id] = !expanded[id];
	}
</script>

<svelte:head>
	<title>Setup Status - PaveRate</title>
</svelte:head>

<div class="completeness-page">
	<!-- Page header -->
	<header class="page-header">
		<div class="page-header-icon">
			<ClipboardCheck size={28} aria-hidden="true" />
		</div>
		<div class="page-header-text">
			<h1>Setup Status</h1>
			<p>Track which jobs have complete configuration data</p>
		</div>
	</header>

	{#if !completeness}
		<div class="loading-state">Loading completeness data...</div>
	{:else}
		<!-- Org-wide summary card -->
		<section class="org-summary" aria-label="Organisation overview">
			<div class="org-score-block">
				<div class="org-score-ring" style="--ring-color: {scoreColor(orgScore)}">
					<span class="org-score-number">{orgScore}</span>
					<span class="org-score-label">avg score</span>
				</div>
			</div>

			<div class="org-stats">
				<div class="stat-card stat-complete">
					<CheckCircle2 size={20} aria-hidden="true" />
					<span class="stat-count">{summary.complete}</span>
					<span class="stat-name">Complete</span>
				</div>
				<div class="stat-card stat-attention">
					<AlertTriangle size={20} aria-hidden="true" />
					<span class="stat-count">{summary.needs_attention}</span>
					<span class="stat-name">Needs attention</span>
				</div>
				<div class="stat-card stat-incomplete">
					<XCircle size={20} aria-hidden="true" />
					<span class="stat-count">{summary.incomplete}</span>
					<span class="stat-name">Incomplete</span>
				</div>
			</div>

			<p class="org-total">{summary.total_sites} job {summary.total_sites === 1 ? 'site' : 'sites'} total</p>
		</section>

		<!-- Per-site list -->
		{#if sites.length === 0}
			<div class="empty-state">
				<ClipboardCheck size={48} aria-hidden="true" />
				<p>No job sites found. <a href="/dashboard/job-sites">Create a job site</a> to get started.</p>
			</div>
		{:else}
			<ul class="site-list" aria-label="Job site completeness">
				{#each sites as site (site.id)}
					{@const c = site.completeness}
					{@const isExpanded = expanded[site.id] ?? false}
					{@const allMissing = [...c.required.missing, ...c.optional.missing]}
					<li class="site-card" class:site-complete={c.status === 'complete'} class:site-attention={c.status === 'needs-attention'} class:site-incomplete={c.status === 'incomplete'}>
						<!-- Site header row -->
						<button
							type="button"
							class="site-header"
							onclick={() => toggle(site.id)}
							aria-expanded={isExpanded}
							aria-controls="site-detail-{site.id}"
						>
							<span class="site-status-icon" style="color: {scoreColor(c.score)}" aria-label={statusLabel(c.status)}>
								{#if c.status === 'complete'}
									<CheckCircle2 size={20} aria-hidden="true" />
								{:else if c.status === 'needs-attention'}
									<AlertTriangle size={20} aria-hidden="true" />
								{:else}
									<XCircle size={20} aria-hidden="true" />
								{/if}
							</span>

							<span class="site-name">{site.name || 'Untitled site'}</span>

							<span class="site-score-bar" aria-hidden="true">
								<span
									class="site-score-fill"
									style="width: {c.score}%; background: {scoreColor(c.score)}"
								></span>
							</span>

							<span class="site-score-num" style="color: {scoreColor(c.score)}">{c.score}</span>

							<span class="site-expand-icon" class:rotated={isExpanded}>
								<ChevronRight size={18} aria-hidden="true" />
							</span>
						</button>

						<!-- Missing fields detail (expanded) -->
						{#if isExpanded}
							<div id="site-detail-{site.id}" class="site-detail">
								{#if allMissing.length === 0}
									<p class="all-good">All fields complete!</p>
								{:else}
									<div class="missing-sections">
										{#if c.required.missing.length > 0}
											<div class="missing-group">
												<h3 class="missing-group-title">Required ({c.required.filled}/{c.required.total})</h3>
												<ul class="missing-list">
													{#each c.required.missing as field}
														<li>
															<a href={deepLink(site.id, field)} class="missing-field-link">
																<span class="missing-field-dot required-dot"></span>
																{fieldLabel(field)}
																<ChevronRight size={14} aria-hidden="true" class="link-arrow" />
															</a>
														</li>
													{/each}
												</ul>
											</div>
										{/if}
										{#if c.optional.missing.length > 0}
											<div class="missing-group">
												<h3 class="missing-group-title">Optional ({c.optional.satisfied}/{c.optional.total})</h3>
												<ul class="missing-list">
													{#each c.optional.missing as field}
														<li>
															<a href={deepLink(site.id, field)} class="missing-field-link">
																<span class="missing-field-dot optional-dot"></span>
																{fieldLabel(field)}
																<ChevronRight size={14} aria-hidden="true" class="link-arrow" />
															</a>
														</li>
													{/each}
												</ul>
											</div>
										{/if}
									</div>
								{/if}

								<div class="site-actions">
									<a href="/dashboard/job-sites/{site.id}?tab=configuration" class="config-btn">
										Open job configuration
									</a>
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	.completeness-page {
		max-width: 800px;
		margin: 0 auto;
		padding: 24px 16px 80px;
	}

	/* ---- Page header ---- */
	.page-header {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-bottom: 28px;
	}

	.page-header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 52px;
		height: 52px;
		background: var(--surface-alt);
		border-radius: 14px;
		color: var(--accent);
		flex-shrink: 0;
	}

	.page-header-text h1 {
		font-size: 1.4rem;
		font-weight: 700;
		margin: 0 0 2px;
	}

	.page-header-text p {
		margin: 0;
		font-size: 0.875rem;
		color: var(--text-muted);
	}

	/* ---- Org summary ---- */
	.org-summary {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 20px;
		margin-bottom: 28px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.org-score-ring {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 100px;
		height: 100px;
		border-radius: 50%;
		border: 6px solid var(--ring-color, var(--accent));
		gap: 2px;
	}

	.org-score-number {
		font-size: 2rem;
		font-weight: 800;
		line-height: 1;
	}

	.org-score-label {
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.org-stats {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		justify-content: center;
		width: 100%;
	}

	.stat-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		flex: 1;
		min-width: 80px;
		padding: 12px 8px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		text-align: center;
	}

	.stat-card.stat-complete { color: var(--color-success, #22c55e); }
	.stat-card.stat-attention { color: var(--color-warning, #f59e0b); }
	.stat-card.stat-incomplete { color: var(--color-danger, #ef4444); }

	.stat-count {
		font-size: 1.5rem;
		font-weight: 800;
		line-height: 1;
		color: inherit;
	}

	.stat-name {
		font-size: 0.72rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.3px;
	}

	.org-total {
		margin: 0;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	/* ---- Site list ---- */
	.site-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.site-card {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
		transition: border-color 0.15s ease;
	}

	.site-card.site-complete { border-left: 3px solid var(--color-success, #22c55e); }
	.site-card.site-attention { border-left: 3px solid var(--color-warning, #f59e0b); }
	.site-card.site-incomplete { border-left: 3px solid var(--color-danger, #ef4444); }

	.site-header {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		min-height: 56px;
		color: var(--text);
		transition: background 0.15s ease;
	}

	.site-header:hover {
		background: var(--surface-hover);
	}

	.site-status-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	.site-name {
		flex: 1;
		font-weight: 600;
		font-size: 0.95rem;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.site-score-bar {
		flex-shrink: 0;
		width: 80px;
		height: 6px;
		background: var(--border);
		border-radius: 3px;
		overflow: hidden;
	}

	.site-score-fill {
		display: block;
		height: 100%;
		border-radius: 3px;
		transition: width 0.4s ease;
	}

	.site-score-num {
		flex-shrink: 0;
		font-size: 0.875rem;
		font-weight: 700;
		min-width: 30px;
		text-align: right;
	}

	.site-expand-icon {
		display: flex;
		align-items: center;
		color: var(--text-muted);
		flex-shrink: 0;
		transition: transform 0.2s ease;
	}

	.site-expand-icon.rotated {
		transform: rotate(90deg);
	}

	/* ---- Site detail (expanded) ---- */
	.site-detail {
		padding: 0 16px 16px;
		border-top: 1px solid var(--border);
	}

	.all-good {
		margin: 12px 0 0;
		color: var(--color-success, #22c55e);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.missing-sections {
		display: flex;
		flex-direction: column;
		gap: 14px;
		margin-top: 12px;
	}

	.missing-group-title {
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
		margin: 0 0 6px;
		font-weight: 700;
	}

	.missing-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.missing-field-link {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 10px;
		min-height: 40px;
		border-radius: 8px;
		font-size: 0.875rem;
		color: var(--text);
		transition: background 0.15s ease, color 0.15s ease;
		text-decoration: none;
	}

	.missing-field-link:hover {
		background: var(--surface-hover);
		color: var(--accent);
	}

	.missing-field-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.required-dot { background: var(--color-danger, #ef4444); }
	.optional-dot { background: var(--color-warning, #f59e0b); }

	.missing-field-link :global(.link-arrow) {
		margin-left: auto;
		color: var(--text-muted);
	}

	.site-actions {
		margin-top: 14px;
		padding-top: 14px;
		border-top: 1px solid var(--border);
	}

	.config-btn {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 0 16px;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		transition: opacity 0.15s ease;
	}

	.config-btn:hover {
		opacity: 0.9;
	}

	/* ---- Empty / loading ---- */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 14px;
		padding: 60px 20px;
		text-align: center;
		color: var(--text-muted);
	}

	.empty-state a {
		color: var(--accent);
	}

	.loading-state {
		padding: 40px;
		text-align: center;
		color: var(--text-muted);
	}

	/* ---- Desktop refinements ---- */
	@media (min-width: 640px) {
		.org-summary {
			flex-direction: row;
			align-items: center;
			flex-wrap: wrap;
		}

		.org-stats {
			flex: 1;
			flex-wrap: nowrap;
		}

		.site-score-bar {
			width: 120px;
		}
	}
</style>

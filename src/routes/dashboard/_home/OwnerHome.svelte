<!--
	OwnerHome — the Owner's portfolio command center. Answers "How is the
	portfolio doing?" with a hero stat band (contract value, placed vs awarded
	with % bar, active projects, tons today), a production-vs-plan section
	(placed / target / awarded), and a "Needs attention" list (setup gaps +
	behind / open-log jobs). No daily-entry forms — Owners read, they don't log.

	Empty state: no projects → a purposeful "import a contract / add a project"
	hero rather than an empty void. All data is real (from /api/org/portfolio +
	enriched projects); everything degrades gracefully to 0/empty.
-->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardGrid from '$lib/components/ui/CardGrid.svelte';
	import StatTile from '$lib/components/ui/StatTile.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import {
		formatCurrencyCompact,
		formatTonsWhole,
		gapLabel,
		type Portfolio,
		type PortfolioJob
	} from './types';
	import type { EnrichedProject } from '$lib/loaders/project-summaries';

	let {
		portfolio,
		projects
	}: {
		portfolio: Portfolio;
		projects: EnrichedProject[];
	} = $props();

	const counts = $derived(portfolio.counts);
	const hasProjects = $derived(counts.total_projects > 0 || projects.length > 0);

	// Placed vs awarded headline %: how much of the awarded tonnage is in the ground.
	const awarded = $derived(portfolio.tonnage_awarded_total);
	const target = $derived(portfolio.tonnage_target_total);
	const placed = $derived(portfolio.tonnage_placed_total);
	const placedVsAwardedPct = $derived(awarded > 0 ? (placed / awarded) * 100 : 0);
	const placedVsTargetPct = $derived(target > 0 ? (placed / target) * 100 : 0);

	// Live-status map for open-today highlighting on the per-job list.
	const liveById = $derived(new Map(projects.map((p) => [p.id, p])));

	// ── Needs attention ──────────────────────────────────────────────────
	// Setup gaps (incomplete projects) + active jobs that are behind plan or have
	// no open log today. Sorted so the worst-off jobs surface first.
	const setupGaps = $derived(portfolio.setup_gaps);

	const behindJobs = $derived(
		portfolio.per_job
			.filter((j) => j.status === 'active' && (j.tonnage_target > 0 || j.tonnage_awarded > 0))
			.filter((j) => j.progress_pct < 50)
			.sort((a, b) => a.progress_pct - b.progress_pct)
			.slice(0, 6)
	);

	const activeNoLogToday = $derived(
		portfolio.per_job.filter(
			(j) => j.status === 'active' && liveById.get(j.id)?.today_log_open === false
		)
	);

	const hasAttention = $derived(
		setupGaps.length > 0 || behindJobs.length > 0
	);

	// Top jobs by contract value for the production-vs-plan table.
	const topJobs = $derived(
		[...portfolio.per_job]
			.filter((j) => j.status !== 'archived')
			.sort((a, b) => b.contract_value - a.contract_value)
			.slice(0, 8)
	);

	function jobTone(j: PortfolioJob): 'good' | 'warn' | 'bad' | 'accent' {
		if (j.tonnage_target === 0 && j.tonnage_awarded === 0) return 'accent';
		if (j.progress_pct >= 90) return 'good';
		if (j.progress_pct < 50) return 'bad';
		return 'warn';
	}
</script>

{#if !hasProjects}
	<!-- Purposeful empty state: an Owner with no projects gets a clear next step. -->
	<Card padding="lg" elevation="sm">
		<div class="empty">
			<h2>Build your portfolio</h2>
			<p>
				Import a contract or add your first project to start tracking contract value,
				tonnage placed vs awarded, and which jobs need attention — all from this page.
			</p>
			<div class="empty__actions">
				<Button href="/dashboard/job-sites/import">Import a contract</Button>
				<Button variant="ghost" href="/dashboard/projects">Add a project</Button>
			</div>
		</div>
	</Card>
{:else}
	<!-- ── Hero stat band ───────────────────────────────────────────────── -->
	<section class="band">
		<CardGrid min="200px" gap="var(--sp-3)">
			<StatTile label="Contract value" value={formatCurrencyCompact(portfolio.contract_value_total)} accent />
			<StatTile
				label="Active projects"
				value={counts.active_projects}
				unit={`of ${counts.total_projects}`}
				href="/dashboard/projects"
			/>
			<StatTile label="Tons today" value={formatTonsWhole(counts.tons_today)} unit="t" />
			<StatTile label="Logging today" value={counts.logging_today} unit="jobs" />
		</CardGrid>
	</section>

	<CardGrid min="320px">
		<!-- ── Production vs plan ───────────────────────────────────────────── -->
		<Card title="Production vs plan" subtitle="Placed tonnage across the portfolio" span={2}>
			<div class="pvp">
				<div class="pvp__row">
					<div class="pvp__head">
						<span class="pvp__label">Placed vs awarded</span>
						<span class="pvp__val">
							{formatTonsWhole(placed)} / {formatTonsWhole(awarded)} t
							<span class="pvp__pct">({Math.round(placedVsAwardedPct)}%)</span>
						</span>
					</div>
					<ProgressBar pct={placedVsAwardedPct} tone="accent" />
				</div>
				<div class="pvp__row">
					<div class="pvp__head">
						<span class="pvp__label">Placed vs target</span>
						<span class="pvp__val">
							{formatTonsWhole(placed)} / {formatTonsWhole(target)} t
							<span class="pvp__pct">({Math.round(placedVsTargetPct)}%)</span>
						</span>
					</div>
					<ProgressBar pct={placedVsTargetPct} tone="good" />
				</div>
				<div class="pvp__legend">
					<span><strong>{formatTonsWhole(awarded)}</strong> awarded</span>
					<span><strong>{formatTonsWhole(target)}</strong> target</span>
					<span><strong>{formatTonsWhole(placed)}</strong> placed</span>
				</div>
			</div>

			{#if topJobs.length > 0}
				<ul class="joblist">
					{#each topJobs as job (job.id)}
						<li>
							<a class="joblist__row" href="/dashboard/job-sites/{job.id}">
								<span class="joblist__name">{job.name}</span>
								<span class="joblist__value">{formatCurrencyCompact(job.contract_value)}</span>
								<span class="joblist__bar">
									<ProgressBar pct={job.progress_pct} tone={jobTone(job)} height="6px" />
								</span>
								<span class="joblist__pct">{Math.round(job.progress_pct)}%</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>

		<!-- ── Needs attention ──────────────────────────────────────────────── -->
		<Card title="Needs attention" subtitle="Setup gaps & jobs behind plan">
			{#if !hasAttention}
				<p class="muted">Nothing flagged. Setup is complete and active jobs are on pace.</p>
			{:else}
				{#if setupGaps.length > 0}
					<h3 class="attn__head">Incomplete setup</h3>
					<ul class="attn">
						{#each setupGaps.slice(0, 6) as gap (gap.id)}
							<li>
								<a class="attn__row" href="/dashboard/job-sites/{gap.id}">
									<span class="attn__name">{gap.name || 'Untitled project'}</span>
									<span class="attn__meta">
										Missing {gap.missing.length}: {gap.missing.slice(0, 3).map(gapLabel).join(', ')}{gap.missing.length > 3 ? '…' : ''}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}

				{#if behindJobs.length > 0}
					<h3 class="attn__head">Behind plan</h3>
					<ul class="attn">
						{#each behindJobs as job (job.id)}
							<li>
								<a class="attn__row" href="/dashboard/job-sites/{job.id}">
									<span class="attn__name">{job.name}</span>
									<span class="attn__meta">
										{Math.round(job.progress_pct)}% placed{liveById.get(job.id)?.today_log_open === false ? ' · no log today' : ''}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</Card>
	</CardGrid>

	{#if activeNoLogToday.length > 0 && setupGaps.length === 0 && behindJobs.length === 0}
		<p class="muted footnote">
			{activeNoLogToday.length} active job{activeNoLogToday.length === 1 ? '' : 's'} have no daily log yet today.
		</p>
	{/if}
{/if}

<style>
	.band {
		margin-bottom: var(--sp-4);
	}

	.empty {
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-6) var(--sp-4);
	}
	.empty h2 {
		margin: 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
	}
	.empty p {
		margin: 0;
		max-width: 480px;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.empty__actions {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		justify-content: center;
		margin-top: var(--sp-2);
	}

	/* Production vs plan */
	.pvp {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		margin-top: var(--sp-2);
	}
	.pvp__row {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.pvp__head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: var(--sp-2);
	}
	.pvp__label {
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}
	.pvp__val {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.pvp__pct {
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.pvp__legend {
		display: flex;
		gap: var(--sp-4);
		flex-wrap: wrap;
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.pvp__legend strong {
		color: var(--text);
	}

	/* Job list (production vs plan rows) */
	.joblist {
		list-style: none;
		margin: var(--sp-4) 0 0;
		padding: var(--sp-4) 0 0;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
	}
	.joblist__row {
		display: grid;
		grid-template-columns: minmax(0, 1.6fr) auto minmax(80px, 1fr) auto;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		min-height: 44px;
		text-decoration: none;
		color: var(--text);
	}
	.joblist__name {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.joblist__value {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.joblist__pct {
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		text-align: right;
		min-width: 40px;
	}
	.joblist__row:hover .joblist__name {
		color: var(--accent);
	}

	/* Needs attention */
	.attn__head {
		margin: var(--sp-4) 0 var(--sp-2);
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.7px;
		color: var(--text-muted);
	}
	.attn__head:first-of-type {
		margin-top: var(--sp-3);
	}
	.attn {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.attn__row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-2) 0;
		min-height: 44px;
		justify-content: center;
		text-decoration: none;
		color: var(--text);
		border-bottom: 1px solid var(--border);
	}
	.attn li:last-child .attn__row {
		border-bottom: none;
	}
	.attn__name {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
	}
	.attn__row:hover .attn__name {
		color: var(--accent);
	}
	.attn__meta {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		margin: var(--sp-2) 0 0;
	}
	.footnote {
		margin-top: var(--sp-4);
	}
</style>

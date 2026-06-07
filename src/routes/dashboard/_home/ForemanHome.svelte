<!--
	ForemanHome — the Foreman's "today's work" desk. Answers "What do I need to
	run today?" The hierarchy leads with a BIG "Start / Continue Today's Log"
	primary CTA that deep-links to the best job's /log in ONE tap, then today's
	target vs placed, the assigned/active jobs strip, and crew/equipment
	readiness. No portfolio finance (no contract value / awarded $).

	The quick-start selection reuses the original dashboard logic: a single
	active job links directly; multiple active jobs open a chooser; zero active
	falls back to the most recently updated job.
-->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardGrid from '$lib/components/ui/CardGrid.svelte';
	import StatTile from '$lib/components/ui/StatTile.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ProgressBar from './ProgressBar.svelte';
	import { formatTonsWhole, type Portfolio } from './types';
	import type { EnrichedProject } from '$lib/loaders/project-summaries';

	let {
		portfolio,
		projects
	}: {
		portfolio: Portfolio;
		projects: EnrichedProject[];
	} = $props();

	const counts = $derived(portfolio.counts);
	const hasProjects = $derived(projects.length > 0);

	// ── Quick-start: best job to start today's log on (reused logic) ───────
	const activeJobs = $derived(projects.filter((s) => s.status?.toLowerCase() === 'active'));
	const quickStartJob = $derived(
		activeJobs.length === 1
			? activeJobs[0]
			: activeJobs.length === 0
				? ([...projects].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0] ?? null)
				: null
	);
	let showChooser = $state(false);
	function handleChooserKey(e: KeyboardEvent) {
		if (e.key === 'Escape') showChooser = false;
	}

	// Does the quick-start job already have an open log today? Drives Start vs Continue.
	const quickStartContinue = $derived(quickStartJob?.today_log_open === true);

	// ── Today: target vs placed (from real per-job rollups + live logs) ────
	const placedToday = $derived(counts.tons_today);
	const todayTargetById = $derived(
		new Map(portfolio.per_job.map((j) => [j.id, j.tonnage_target]))
	);

	// Assigned/active job strip with live state.
	const assigned = $derived(
		[...projects]
			.filter((s) => s.status?.toLowerCase() === 'active')
			.sort((a, b) => Number(b.today_log_open) - Number(a.today_log_open))
	);

	// Crew/equipment readiness signal: how many active jobs have a crew assigned.
	const withCrew = $derived(assigned.filter((s) => s.crew_name).length);
</script>

{#if !hasProjects}
	<!-- Empty state: a foreman with no assigned work gets a clear pointer. -->
	<Card padding="lg" elevation="sm">
		<div class="empty">
			<h2>No jobs assigned yet</h2>
			<p>
				When a job is assigned to your crew it shows here, ready to start today's log in one tap.
				In the meantime, browse the active projects.
			</p>
			<div class="empty__actions">
				<Button href="/dashboard/projects">View projects</Button>
			</div>
		</div>
	</Card>
{:else}
	<!-- ── BIG primary CTA: start/continue today's log in one tap ──────────── -->
	<section class="cta">
		{#if quickStartJob && activeJobs.length <= 1}
			<a class="cta__btn" href="/dashboard/job-sites/{quickStartJob.id}/log">
				<span class="cta__kicker">{quickStartContinue ? 'Continue' : 'Start'} today's log</span>
				<span class="cta__job">{quickStartJob.name}</span>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<polyline points="9 18 15 12 9 6"></polyline>
				</svg>
			</a>
		{:else if activeJobs.length > 1}
			<div class="cta__wrap">
				<button
					class="cta__btn"
					onclick={() => (showChooser = !showChooser)}
					onkeydown={handleChooserKey}
					aria-haspopup="listbox"
					aria-expanded={showChooser}
				>
					<span class="cta__kicker">Start today's log</span>
					<span class="cta__job">Choose from {activeJobs.length} active jobs</span>
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class:rotated={showChooser}>
						<polyline points="6 9 12 15 18 9"></polyline>
					</svg>
				</button>
				{#if showChooser}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="cta__overlay" onclick={() => (showChooser = false)}></div>
					<ul class="cta__menu" role="listbox" aria-label="Choose a job">
						{#each activeJobs as job (job.id)}
							<li role="option" aria-selected="false">
								<a
									href="/dashboard/job-sites/{job.id}/log"
									class="cta__menu-item"
									onclick={() => (showChooser = false)}
								>
									<span class="cta__menu-name">{job.name}</span>
									{#if job.today_log_open}
										<span class="cta__menu-tag">Logging</span>
									{:else if job.location_description}
										<span class="cta__menu-loc">{job.location_description}</span>
									{/if}
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	</section>

	<!-- ── Today's numbers ──────────────────────────────────────────────── -->
	<section class="band">
		<CardGrid min="200px" gap="var(--sp-3)">
			<StatTile label="Tons placed today" value={formatTonsWhole(placedToday)} unit="t" accent />
			<StatTile label="Logging now" value={counts.logging_today} unit="jobs" />
			<StatTile label="Active jobs" value={activeJobs.length} />
			<StatTile label="Crews ready" value={withCrew} unit={`of ${activeJobs.length}`} />
		</CardGrid>
	</section>

	<CardGrid min="320px">
		<!-- ── Assigned / active jobs ───────────────────────────────────────── -->
		<Card title="Today's jobs" subtitle="Assigned & active" span={2}>
			{#if assigned.length === 0}
				<p class="muted">No active jobs right now. Recently updated work is one tap away above.</p>
			{:else}
				<ul class="jobs">
					{#each assigned as job (job.id)}
						{@const target = todayTargetById.get(job.id) ?? 0}
						{@const placed = job.today_tons ?? 0}
						{@const pct = target > 0 ? (placed / target) * 100 : 0}
						<li>
							<div class="jobs__row">
								<div class="jobs__main">
									<a class="jobs__name" href="/dashboard/job-sites/{job.id}">{job.name}</a>
									<div class="jobs__sub">
										<StatusBadge
											status={job.today_log_open ? 'logging' : job.status}
											label={job.today_log_open ? 'Logging' : undefined}
										/>
										{#if job.crew_name}
											<span class="jobs__crew">
												<span class="crew-dot" style="background:{job.crew_color || 'var(--accent)'}"></span>
												{job.crew_name}
											</span>
										{/if}
									</div>
									{#if target > 0}
										<div class="jobs__meter">
											<ProgressBar {pct} tone={pct >= 100 ? 'good' : 'accent'} height="6px" />
											<span class="jobs__meter-label">
												{formatTonsWhole(placed)} / {formatTonsWhole(target)} t target
											</span>
										</div>
									{/if}
								</div>
								<a class="jobs__log" href="/dashboard/job-sites/{job.id}/log">
									{job.today_log_open ? 'Continue' : 'Log'}
								</a>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Card>

		<!-- ── Crew & equipment readiness ───────────────────────────────────── -->
		<Card title="Crew &amp; equipment">
			<ul class="ready">
				<li>
					<span class="ready__k">Crews assigned</span>
					<span class="ready__v">{withCrew} / {activeJobs.length}</span>
				</li>
				<li>
					<span class="ready__k">Jobs logging today</span>
					<span class="ready__v">{counts.logging_today}</span>
				</li>
			</ul>
			{#if activeJobs.length - withCrew > 0}
				<p class="warn-note">
					{activeJobs.length - withCrew} active job{activeJobs.length - withCrew === 1 ? '' : 's'} have no crew assigned.
				</p>
			{/if}
			<div class="stack">
				<Button block variant="ghost" href="/dashboard/team">View crews</Button>
				<Button block variant="ghost" href="/dashboard/map">Today's routes</Button>
			</div>
		</Card>
	</CardGrid>
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
		justify-content: center;
		margin-top: var(--sp-2);
	}

	/* Big CTA */
	.cta {
		margin-bottom: var(--sp-4);
	}
	.cta__wrap {
		position: relative;
	}
	.cta__btn {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		width: 100%;
		min-height: 72px;
		padding: var(--sp-4) var(--sp-5);
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius-md);
		text-decoration: none;
		text-align: left;
		cursor: pointer;
		font-family: inherit;
		transition:
			filter var(--dur) var(--ease),
			transform var(--dur) var(--ease);
	}
	.cta__btn:hover {
		filter: brightness(1.05);
	}
	@media (prefers-reduced-motion: no-preference) {
		.cta__btn:active {
			transform: scale(0.99);
		}
	}
	.cta__kicker {
		display: block;
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.7px;
		opacity: 0.85;
	}
	.cta__job {
		display: block;
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		line-height: 1.2;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.cta__btn > span:first-child {
		flex: 1;
		min-width: 0;
	}
	.cta__btn svg {
		flex-shrink: 0;
	}
	.cta__btn :global(svg.rotated) {
		transform: rotate(180deg);
	}

	.cta__overlay {
		position: fixed;
		inset: 0;
		z-index: 10;
	}
	.cta__menu {
		position: absolute;
		left: 0;
		right: 0;
		top: calc(100% + 6px);
		z-index: 20;
		max-height: 360px;
		overflow-y: auto;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: var(--sp-1) 0;
		list-style: none;
		margin: 0;
	}
	.cta__menu-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-3) var(--sp-4);
		text-decoration: none;
		color: var(--text);
		min-height: 48px;
		justify-content: center;
		transition: background var(--dur) var(--ease);
	}
	.cta__menu-item:hover {
		background: var(--surface-hover);
	}
	.cta__menu-name {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-md);
	}
	.cta__menu-loc {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.cta__menu-tag {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--accent);
	}

	/* Jobs list */
	.jobs {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.jobs__row {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		padding: var(--sp-3) 0;
		border-bottom: 1px solid var(--border);
	}
	.jobs li:last-child .jobs__row {
		border-bottom: none;
	}
	.jobs__main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.jobs__name {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-md);
		color: var(--text);
		text-decoration: none;
	}
	.jobs__name:hover {
		color: var(--accent);
	}
	.jobs__sub {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}
	.jobs__crew {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
	}
	.crew-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}
	.jobs__meter {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
	}
	.jobs__meter-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}
	.jobs__log {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 48px;
		min-width: 72px;
		padding: 0 var(--sp-4);
		border-radius: var(--radius-md);
		background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
		color: var(--accent);
		font-weight: var(--fw-bold);
		font-size: var(--fs-sm);
		text-decoration: none;
		transition: background var(--dur) var(--ease);
	}
	.jobs__log:hover {
		background: color-mix(in srgb, var(--accent) 22%, var(--surface));
	}

	/* Readiness */
	.ready {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.ready li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-bottom: 1px solid var(--border);
	}
	.ready li:last-child {
		border-bottom: none;
	}
	.ready__k {
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.ready__v {
		font-size: var(--fs-md);
		font-weight: var(--fw-bold);
		font-variant-numeric: tabular-nums;
	}
	.warn-note {
		margin: var(--sp-3) 0 0;
		font-size: var(--fs-sm);
		color: var(--warn);
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		margin: var(--sp-2) 0 0;
	}
</style>

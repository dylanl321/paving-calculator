<!--
	AdminOfficeHome — the Admin/Office setup & ops desk. Answers "What needs
	setup, import, scheduling, governance?" It LEADS with setup gaps (incomplete
	projects + the exact missing fields), then an import/queue entry, missing
	contract/customer/schedule callouts, and team/settings quick links.

	Primary action = finish setup / import (not generic production stats).
	Empty state: nothing to fix → an import-first hero. All data is real.
-->
<script lang="ts">
	import Card from '$lib/components/ui/Card.svelte';
	import CardGrid from '$lib/components/ui/CardGrid.svelte';
	import StatTile from '$lib/components/ui/StatTile.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { gapLabel, type Portfolio } from './types';
	import type { EnrichedProject } from '$lib/loaders/project-summaries';

	let {
		portfolio,
		projects
	}: {
		portfolio: Portfolio;
		projects: EnrichedProject[];
	} = $props();

	const counts = $derived(portfolio.counts);
	const setupGaps = $derived(portfolio.setup_gaps);
	const hasProjects = $derived(counts.total_projects > 0 || projects.length > 0);

	// Missing operational data, derived from the real enriched project rows.
	const missingCustomer = $derived(
		projects.filter((p) => p.status !== 'archived' && !p.customer_name)
	);
	const missingSchedule = $derived(
		projects.filter((p) => p.status !== 'archived' && !p.est_start_date)
	);
	const missingContract = $derived(
		portfolio.per_job.filter((j) => j.status !== 'archived' && j.contract_value <= 0)
	);
</script>

{#if !hasProjects}
	<!-- Empty state: lead the Admin/Office user straight into import/setup. -->
	<Card padding="lg" elevation="sm">
		<div class="empty">
			<h2>Set up your first job</h2>
			<p>
				Import a contract PDF to auto-fill the bid items and specs, or add a project
				manually. Setup gaps and missing data will surface here as you go.
			</p>
			<div class="empty__actions">
				<Button href="/dashboard/job-sites/import">Import a contract</Button>
				<Button variant="ghost" href="/dashboard/projects">Add a project</Button>
			</div>
		</div>
	</Card>
{:else}
	<!-- ── Setup posture band ───────────────────────────────────────────── -->
	<section class="band">
		<CardGrid min="200px" gap="var(--sp-3)">
			<StatTile label="Need setup" value={setupGaps.length} unit="jobs" accent={setupGaps.length > 0} />
			<StatTile label="Missing contract" value={missingContract.length} unit="jobs" />
			<StatTile label="Missing customer" value={missingCustomer.length} unit="jobs" />
			<StatTile label="No schedule" value={missingSchedule.length} unit="jobs" />
		</CardGrid>
	</section>

	<CardGrid min="320px">
		<!-- ── Incomplete setup (the lead) ──────────────────────────────────── -->
		<Card span={2}>
			{#snippet actions()}
				<Button size="sm" href="/dashboard/job-sites/import">Import a contract</Button>
			{/snippet}
			{#snippet children()}
				<div class="card-head">
					<h2 class="card-title">Finish setup</h2>
					<p class="card-sub">Incomplete projects and the fields they're missing</p>
				</div>
				{#if setupGaps.length === 0}
					<p class="muted">Every active project has its required setup complete.</p>
				{:else}
					<ul class="gaps">
						{#each setupGaps as gap (gap.id)}
							<li>
								<a class="gaps__row" href="/dashboard/job-sites/{gap.id}">
									<span class="gaps__name">{gap.name || 'Untitled project'}</span>
									<span class="gaps__chips">
										{#each gap.missing.slice(0, 5) as field (field)}
											<span class="chip">{gapLabel(field)}</span>
										{/each}
										{#if gap.missing.length > 5}
											<span class="chip chip--more">+{gap.missing.length - 5}</span>
										{/if}
									</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			{/snippet}
		</Card>

		<!-- ── Import / queue + governance ──────────────────────────────────── -->
		<Card title="Import &amp; queue">
			<p class="muted">Bring contracts in by PDF — bid items, specs, and quantities auto-fill.</p>
			<div class="stack">
				<Button block href="/dashboard/job-sites/import">Import a contract (PDF)</Button>
				<Button block variant="ghost" href="/dashboard/import">Import history &amp; queue</Button>
			</div>
		</Card>

		<!-- ── Missing operational data ─────────────────────────────────────── -->
		<Card title="Missing data" subtitle="Contract, customer & schedule">
			{#if missingContract.length === 0 && missingCustomer.length === 0 && missingSchedule.length === 0}
				<p class="muted">No core operational data missing across active projects.</p>
			{:else}
				<ul class="data">
					{#if missingContract.length > 0}
						<li>
							<span class="data__k">No contract value</span>
							<span class="data__v">{missingContract.length}</span>
						</li>
					{/if}
					{#if missingCustomer.length > 0}
						<li>
							<span class="data__k">No customer</span>
							<span class="data__v">{missingCustomer.length}</span>
						</li>
					{/if}
					{#if missingSchedule.length > 0}
						<li>
							<span class="data__k">No start date</span>
							<span class="data__v">{missingSchedule.length}</span>
						</li>
					{/if}
				</ul>
				<a class="data__link" href="/dashboard/completeness">Review setup completeness →</a>
			{/if}
		</Card>

		<!-- ── Team & settings quick links ──────────────────────────────────── -->
		<Card title="Team &amp; settings">
			<div class="stack">
				<Button block variant="ghost" href="/dashboard/team">Manage team</Button>
				<Button block variant="ghost" href="/dashboard/settings">Org settings</Button>
				<Button block variant="ghost" href="/dashboard/projects">All projects</Button>
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
		flex-wrap: wrap;
		justify-content: center;
		margin-top: var(--sp-2);
	}

	.card-head {
		margin-bottom: var(--sp-3);
	}
	.card-title {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
	}
	.card-sub {
		margin: 2px 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	/* Setup gaps list */
	.gaps {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.gaps__row {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		padding: var(--sp-3) 0;
		min-height: 48px;
		justify-content: center;
		text-decoration: none;
		color: var(--text);
		border-bottom: 1px solid var(--border);
	}
	.gaps li:last-child .gaps__row {
		border-bottom: none;
	}
	.gaps__name {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-md);
	}
	.gaps__row:hover .gaps__name {
		color: var(--accent);
	}
	.gaps__chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-1);
	}
	.chip {
		display: inline-flex;
		align-items: center;
		padding: 2px var(--sp-2);
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--warn) 16%, transparent);
		color: var(--warn);
		font-size: var(--fs-2xs);
		font-weight: var(--fw-semibold);
		white-space: nowrap;
	}
	.chip--more {
		background: var(--surface-hover);
		color: var(--text-muted);
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
	}

	/* Missing data list */
	.data {
		list-style: none;
		margin: var(--sp-2) 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
	}
	.data li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-bottom: 1px solid var(--border);
	}
	.data li:last-child {
		border-bottom: none;
	}
	.data__k {
		font-size: var(--fs-sm);
		color: var(--text);
	}
	.data__v {
		font-size: var(--fs-md);
		font-weight: var(--fw-bold);
		color: var(--warn);
		font-variant-numeric: tabular-nums;
	}
	.data__link {
		display: inline-block;
		margin-top: var(--sp-3);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--accent);
		text-decoration: none;
	}
	.data__link:hover {
		text-decoration: underline;
	}

	.muted {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		margin: var(--sp-2) 0 0;
	}
</style>

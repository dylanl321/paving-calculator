<!--
	Reports: every job's recent daily logs in one list, newest first, with the
	next step on each row. Leads with the answer to "is anything waiting on
	me?" (past days that are still open). Production by crew links to the
	existing crew productivity page for owners and admins.
-->
<script lang="ts">
	import { config } from '$lib/config';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { buildReportRows, reportsHeadline } from '$lib/reports';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const today = new Date().toISOString().split('T')[0];
	let jobFilter = $state('all');

	const allRows = $derived(buildReportRows(data.jobs, data.logsByJob));
	const rows = $derived(jobFilter === 'all' ? allRows : allRows.filter((r) => r.jobId === jobFilter));
	const headline = $derived(reportsHeadline(allRows, today));
	const canSeeCrews = $derived(data.role === 'owner' || data.role === 'admin');

	function formatDay(iso: string): string {
		const d = new Date(iso + 'T12:00:00');
		return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
	}
</script>

<svelte:head>
	<title>Reports — {config.app.name}</title>
</svelte:head>

<div class="reports">
	<PageHeader title={headline.title} subtitle={headline.subtitle}>
		{#snippet actions()}
			{#if canSeeCrews}
				<Button variant="ghost" href="/admin/org/crew-productivity">Production by crew</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if data.jobs.length > 1}
		<label class="filter">
			<span>Job</span>
			<select bind:value={jobFilter}>
				<option value="all">All jobs</option>
				{#each data.jobs as job (job.id)}
					<option value={job.id}>{job.name}</option>
				{/each}
			</select>
		</label>
	{/if}

	{#if rows.length === 0}
		<p class="empty">No daily logs in the last two weeks.</p>
	{:else}
		<ul class="rows">
			{#each rows as row (row.logId)}
				<li class="row">
					<span class="day">{row.date === today ? 'Today' : formatDay(row.date)}</span>
					<span class="job">{row.jobName}</span>
					<span
						class="status"
						class:status--open={!row.closed && row.date < today}
						class:status--done={row.closed}
					>
						{row.status}
					</span>
					<span class="actions">
						{#if row.closed}
							<Button size="sm" variant="secondary" href="/dashboard/job-sites/{row.jobId}/report?date={row.date}">Report</Button>
						{:else}
							<Button size="sm" variant={row.date < today ? 'primary' : 'secondary'} href="/dashboard/job-sites/{row.jobId}/log?date={row.logId}">
								{row.date < today ? 'Close day' : 'Open log'}
							</Button>
						{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.reports {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		max-width: 1120px;
	}
	.filter {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.filter select {
		min-height: 44px;
		padding: 0 12px;
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		font: inherit;
	}
	.rows {
		list-style: none;
		margin: 0;
		padding: 0 var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3) 0;
		border-top: 1px solid var(--border);
		min-height: 48px;
	}
	.row:first-child {
		border-top: 0;
	}
	.day {
		width: 110px;
		font-weight: var(--fw-medium, 500);
	}
	.job {
		flex: 1 1 180px;
		min-width: 0;
	}
	.status {
		width: 180px;
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.status--open {
		color: var(--warn);
		font-weight: var(--fw-medium, 500);
	}
	.status--done {
		color: var(--good);
	}
	.actions {
		margin-left: auto;
	}
	.empty {
		color: var(--text-muted);
	}
</style>

<script lang="ts">
	import type { PageData } from './$types';
	import type { PlanStatus } from '$lib/plan-status';
	import Button from '$lib/components/ui/Button.svelte';

	let { data }: { data: PageData } = $props();
	const site = $derived(data.site as { name: string; id: string; customer_name?: string | null; job_number?: string | null });
	const status = $derived(data.status as PlanStatus | null);
	const logs = $derived(
		(data.logs as Array<{ log_date?: string; weather_conditions?: string | null; crew_count?: number | null }>) ?? []
	);
	const focus = $derived(
		data.date ? logs.filter((log) => log.log_date === data.date) : logs.slice(0, 1)
	);

	function printReport() {
		window.print();
	}
</script>

<svelte:head>
	<title>{site.name} report</title>
</svelte:head>

<article class="report">
	<header class="no-print">
		<Button variant="ghost" href="/dashboard/job-sites/{site.id}">Back to project</Button>
		<Button onclick={printReport}>Print or save PDF</Button>
	</header>
	<h1>{site.name}</h1>
	<p class="meta">
		{#if site.job_number}Job {site.job_number} · {/if}
		{#if site.customer_name}{site.customer_name} · {/if}
		PaveRate project summary
	</p>

	{#if status}
		<h2>Production vs plan</h2>
		<table>
			<tbody>
				<tr><th scope="row">Pace</th><td>{status.pace.replaceAll('_', ' ')}</td></tr>
				<tr><th scope="row">Tons placed</th><td>{status.placedTons} of {status.plannedTons ?? '—'}</td></tr>
				<tr><th scope="row">Tons remaining</th><td>{status.tonsRemaining ?? '—'}</td></tr>
				<tr><th scope="row">Miles paved</th><td>{status.pavedMiles} of {status.totalMiles ?? '—'}</td></tr>
				<tr><th scope="row">Yield</th><td>{status.actualSpreadLbsSy ?? '—'} lbs/sy (target {status.targetSpreadLbsSy ?? '—'})</td></tr>
				<tr><th scope="row">Days remaining</th><td>{status.daysRemaining ?? '—'}</td></tr>
				<tr><th scope="row">Weather days</th><td>{status.weatherDays}</td></tr>
			</tbody>
		</table>
	{:else}
		<p>Production totals are not available yet.</p>
	{/if}

	<h2>{data.date ? `Daily report ${data.date}` : 'Latest daily log'}</h2>
	{#if focus.length === 0}
		<p>No daily log for this date.</p>
	{:else}
		<ul>
			{#each focus as log (log.log_date)}
				<li>
					{log.log_date ?? 'Undated'}
					{#if log.weather_conditions} · {log.weather_conditions}{/if}
					{#if log.crew_count != null} · crew {log.crew_count}{/if}
				</li>
			{/each}
		</ul>
	{/if}
</article>

<style>
	.report {
		max-width: 800px;
		margin: 0 auto;
		padding: var(--sp-4);
		color: var(--text);
		background: var(--bg);
	}

	header {
		display: flex;
		gap: var(--sp-3);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}

	h1 { margin: 0 0 var(--sp-2); }
	.meta { color: var(--text-muted); }

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th, td {
		text-align: left;
		padding: 10px 8px;
		border-bottom: 1px solid var(--border);
	}

	th { width: 40%; color: var(--text-muted); font-weight: 600; }

	@media print {
		:global(nav), :global(.sidebar), :global(.offline-banner), .no-print { display: none !important; }
		.report { max-width: none; background: white; color: black; }
		th, td { border-bottom: 1px solid #ccc; color: black; }
	}
</style>

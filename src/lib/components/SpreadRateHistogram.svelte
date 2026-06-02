<script lang="ts">
	import SpreadRateHistogramChart from './charts/SpreadRateHistogram.svelte';
	import { fetchJson } from '$lib/utils/api';

	interface DbLoad {
		id: string;
		job_site_id: string;
		user_id: string;
		ticket_number: string | null;
		tons: number;
		timestamp: number;
		spread_rate: number | null;
		notes: string | null;
		created_at: number;
	}

	interface Props {
		jobSiteId: string;
		targetRate?: number | null;
		toleranceLbsSy?: number;
	}

	let { jobSiteId, targetRate = null, toleranceLbsSy = 5 }: Props = $props();

	let loads = $state<DbLoad[]>([]);
	let loading = $state(true);

	$effect(() => {
		const id = jobSiteId;
		loading = true;
		fetchJson<{ loads?: DbLoad[] }>(`/api/job-sites/${id}/loads?limit=200`)
			.then(({ data }) => {
				loads = data.loads ?? [];
			})
			.catch(() => {
				loads = [];
			})
			.finally(() => {
				loading = false;
			});
	});

	const loadsWithRate = $derived(loads.filter((l) => l.spread_rate != null));

	const avgRate = $derived.by(() => {
		if (loadsWithRate.length === 0) return null;
		const sum = loadsWithRate.reduce((acc, l) => acc + (l.spread_rate ?? 0), 0);
		return sum / loadsWithRate.length;
	});

	const inSpecPercent = $derived.by(() => {
		if (loadsWithRate.length === 0 || targetRate == null) return null;
		const inSpec = loadsWithRate.filter(
			(l) => Math.abs((l.spread_rate ?? 0) - targetRate) <= toleranceLbsSy
		).length;
		return (inSpec / loadsWithRate.length) * 100;
	});
</script>

<section class="histogram-panel">
	<div class="panel-head">
		<h3>Spread Rate Distribution</h3>
	</div>

	{#if loading}
		<div class="loading-state">Loading...</div>
	{:else}
		<SpreadRateHistogramChart {loads} {targetRate} {toleranceLbsSy} />
		{#if loadsWithRate.length > 0}
			<div class="summary">
				{loadsWithRate.length} loads •
				{#if avgRate != null}avg {avgRate.toFixed(1)} lbs/yd²{/if}
				{#if inSpecPercent != null} • {inSpecPercent.toFixed(0)}% in-spec{/if}
			</div>
		{/if}
	{/if}
</section>

<style>
	.histogram-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 16px;
	}

	.panel-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
	}

	.panel-head h3 {
		margin: 0;
		font-size: 1.05rem;
	}

	.loading-state {
		padding: 24px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.summary {
		font-size: 0.85rem;
		color: var(--text-muted);
		text-align: center;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
</style>

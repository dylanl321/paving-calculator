<script lang="ts">
	import { today } from '$lib/stores/today.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { formatFeet } from '$lib/utils/format';

	interface Props {
		/** compact = side-pane variant (stacked), full = stage variant (grid) */
		variant?: 'compact' | 'full';
	}
	let { variant = 'full' }: Props = $props();

	const r = $derived(today.rollup);
	const y = $derived(today.yieldVsTarget(job.widthFt, job.thicknessIn));
</script>

<div class="summary" class:compact={variant === 'compact'}>
	<div class="tiles">
		<div class="tile">
			<span class="tv">{r.total_tons.toLocaleString(undefined, { maximumFractionDigits: 1 })}</span>
			<span class="tl">tons placed</span>
		</div>
		<div class="tile">
			<span class="tv">{formatFeet(r.total_distance_ft)}</span>
			<span class="tl">paved today</span>
		</div>
		<div class="tile">
			<span class="tv">{r.total_loads}</span>
			<span class="tl">loads</span>
		</div>
		<div class="tile">
			<span class="tv">{r.total_tack_gallons.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
			<span class="tl">gal tack</span>
		</div>
	</div>

	<div class="yield" class:has-status={y.status != null}>
		<div class="yield-head">
			<span class="eyebrow">Yield vs Target</span>
			{#if y.status}
				<span class="ybadge {y.status}">
					{y.diffPct != null ? `${y.diffPct > 0 ? '+' : ''}${y.diffPct.toFixed(1)}%` : ''}
				</span>
			{/if}
		</div>
		{#if y.actualRate != null && y.targetRate != null}
			<div class="yield-rates">
				<span><b>{Math.round(y.actualRate)}</b> actual</span>
				<span class="vs">vs</span>
				<span><b>{Math.round(y.targetRate)}</b> target lbs/SY</span>
			</div>
		{:else}
			<p class="yield-empty">Log paving with tons + distance to track day yield against load tickets.</p>
		{/if}
	</div>
</div>

<style>
	.summary {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}
	.tiles {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: var(--sp-2);
	}
	.summary.compact .tiles {
		grid-template-columns: 1fr 1fr;
	}
	.tile {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.tv {
		font-size: var(--fs-lg);
		font-weight: var(--fw-heavy);
		color: var(--accent);
		line-height: 1.1;
	}
	.tl {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.yield {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3) var(--sp-4);
	}
	.yield-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.ybadge {
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		padding: 3px 10px;
		border-radius: var(--radius-pill);
	}
	.ybadge.good {
		background: color-mix(in srgb, var(--good) 20%, transparent);
		color: var(--good);
	}
	.ybadge.warn {
		background: color-mix(in srgb, var(--warn) 20%, transparent);
		color: var(--warn);
	}
	.ybadge.bad {
		background: color-mix(in srgb, var(--bad) 20%, transparent);
		color: var(--bad);
	}
	.yield-rates {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.yield-rates b {
		font-size: var(--fs-lg);
		color: var(--text);
		font-weight: var(--fw-bold);
	}
	.vs {
		color: var(--text-muted);
	}
	.yield-empty {
		margin: var(--sp-2) 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	@media (max-width: 600px) {
		.tiles {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>

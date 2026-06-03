<script lang="ts">
	import { spreadSpecCheck, spreadToleranceFor } from '$lib/config';
	import type { OrgOverrides } from '$lib/config/overrides';
	import HelpTip from './HelpTip.svelte';

	// ComplianceGauge receives courseType as a prop from parent components.
	// It does not use calcContext directly - the parent is responsible for
	// passing the appropriate courseType value (whether from job site config,
	// calcContext, or other sources).

	interface Props {
		entries: Array<{
			spread_rate_actual: number | null;
			tons_placed: number | null;
			distance_ft: number | null;
			entry_type: string;
		}>;
		targetSpreadRate: number | null;
		courseType: string | null;
		overrides?: OrgOverrides | null;
	}

	let { entries, targetSpreadRate, courseType, overrides = null }: Props = $props();

	const pavingEntries = $derived(
		entries.filter(
			(e) => e.entry_type === 'paving' && e.spread_rate_actual != null
		)
	);

	const statusCounts = $derived.by(() => {
		const counts = { good: 0, warn: 0, bad: 0 };
		for (const entry of pavingEntries) {
			const check = spreadSpecCheck(
				entry.spread_rate_actual,
				targetSpreadRate,
				courseType,
				overrides
			);
			if (check) {
				counts[check.status]++;
			}
		}
		return counts;
	});

	const total = $derived(statusCounts.good + statusCounts.warn + statusCounts.bad);
	const pctInSpec = $derived(total > 0 ? (statusCounts.good / total) * 100 : 0);

	const tolerance = $derived(spreadToleranceFor(courseType, overrides));
	const hasTarget = $derived(targetSpreadRate != null && targetSpreadRate > 0);
</script>

<div class="compliance-gauge">
	<div class="gauge-header">
		<h3>DOT Compliance</h3>
		<HelpTip text="Shows how many of today's loads are within spec tolerance. Green = on-spec, yellow = marginal, red = out of spec." />
	</div>

	{#if !hasTarget}
		<div class="empty-state">
			<p>Set a target spread rate in job configuration to see compliance</p>
		</div>
	{:else if total === 0}
		<div class="empty-state">
			<p>No spread rate data logged yet</p>
		</div>
	{:else}
		<div class="gauge-body">
			<div class="main-stat">
				<span class="percentage">{pctInSpec.toFixed(0)}%</span>
				<span class="label">in spec</span>
			</div>

			<div class="bar-gauge">
				{#if statusCounts.good > 0}
					<div
						class="bar-segment bar-good"
						style:width="{(statusCounts.good / total) * 100}%"
						title="{statusCounts.good} entries in spec"
					></div>
				{/if}
				{#if statusCounts.warn > 0}
					<div
						class="bar-segment bar-warn"
						style:width="{(statusCounts.warn / total) * 100}%"
						title="{statusCounts.warn} entries marginal"
					></div>
				{/if}
				{#if statusCounts.bad > 0}
					<div
						class="bar-segment bar-bad"
						style:width="{(statusCounts.bad / total) * 100}%"
						title="{statusCounts.bad} entries out of spec"
					></div>
				{/if}
			</div>

			<div class="breakdown">
				<span class="breakdown-label">
					{statusCounts.good} of {total} entries within DOT Table 12 tolerance (±{tolerance.toleranceLbsSy} lbs/SY)
				</span>
			</div>

			<div class="legend">
				<div class="legend-item">
					<span class="legend-dot legend-dot-good"></span>
					<span class="legend-text">In Spec</span>
				</div>
				<div class="legend-item">
					<span class="legend-dot legend-dot-warn"></span>
					<span class="legend-text">Marginal</span>
				</div>
				<div class="legend-item">
					<span class="legend-dot legend-dot-bad"></span>
					<span class="legend-text">Out of Spec</span>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.compliance-gauge {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
		margin-bottom: 24px;
	}

	.gauge-header {
		display: flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 16px;
	}

	.gauge-header h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
	}

	.empty-state {
		padding: 24px 0;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.empty-state p {
		margin: 0;
	}

	.gauge-body {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.main-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.percentage {
		font-size: 3rem;
		font-weight: 700;
		color: var(--accent);
		line-height: 1;
	}

	.label {
		font-size: 0.9rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.bar-gauge {
		display: flex;
		height: 48px;
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface-alt);
	}

	.bar-segment {
		transition: width 0.4s ease;
	}

	.bar-good {
		background: var(--good);
	}

	.bar-warn {
		background: var(--warn);
	}

	.bar-bad {
		background: var(--bad);
	}

	.breakdown {
		text-align: center;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.breakdown-label {
		display: inline-block;
		line-height: 1.4;
	}

	.legend {
		display: flex;
		justify-content: center;
		gap: 16px;
		flex-wrap: wrap;
		padding-top: 8px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.legend-dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
	}

	.legend-dot-good {
		background: var(--good);
	}

	.legend-dot-warn {
		background: var(--warn);
	}

	.legend-dot-bad {
		background: var(--bad);
	}

	.legend-text {
		font-size: 0.75rem;
	}

	@media (min-width: 768px) {
		.main-stat {
			flex-direction: row;
			justify-content: center;
			gap: 12px;
			align-items: baseline;
		}

		.percentage {
			font-size: 4rem;
		}

		.label {
			font-size: 1.1rem;
		}
	}
</style>

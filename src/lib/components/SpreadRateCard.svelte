<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import SpreadRateGauge from './SpreadRateGauge.svelte';
	import { constantMeta, placementCheck, rainCheck, spreadSpecCheck, spreadToleranceFor } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { spreadRateFromThickness, spreadRatePlaced } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	// Reality-check inputs (local to this calc; width/thickness/machine are shared).
	let tons = $state<number | null>(null);
	let distanceFt = $state<number | null>(null);
	let customTargetRate = $state<number | null>(null);

	function clearInputs() {
		tons = null;
		distanceFt = null;
		customTargetRate = null;
		logDraft.clearFor('spread-rate');
	}

	const targetRate = $derived(
		customTargetRate != null && customTargetRate > 0
			? customTargetRate
			: job.thicknessIn > 0
				? spreadRateFromThickness(job.thicknessIn)
				: null
	);

	const placedRate = $derived(
		tons && distanceFt && job.widthFt
			? spreadRatePlaced({
					tons,
					lengthFt: distanceFt,
					widthFt: job.widthFt,
					machineId: job.machineId,
					firstPass: job.firstPass
				})
			: null
	);

	const tolerance = $derived(spreadToleranceFor(job.courseType));
	const spec = $derived(spreadSpecCheck(placedRate, targetRate, job.courseType));

	const badge = $derived(
		spec ? { kind: spec.status, text: spec.label } : null
	);

	const multMeta = constantMeta('CONST.THICK_MULT');
	const placement = $derived(placementCheck(weather.effectiveTempF, job.thicknessIn));
	const rain = $derived(rainCheck(weather.rainNext24hIn));

	const targetBadge = $derived.by(() => {
		if (rain?.status === 'fail') {
			return { kind: 'bad' as const, text: 'Rain — hold paving' };
		}
		if (placement?.status === 'fail') {
			return { kind: 'bad' as const, text: placement.message };
		}
		if (placement?.status === 'warn') {
			return { kind: 'warn' as const, text: placement.message };
		}
		if (rain?.status === 'warn') {
			return { kind: 'warn' as const, text: 'Rain forecast — check surface' };
		}
		if (placement?.status === 'pass') {
			return { kind: 'good' as const, text: `Table 4 OK at ${weather.effectiveTempF}°F` };
		}
		return null;
	});

	$effect(() => {
		if (placedRate != null && tons && distanceFt) {
			logDraft.set({
				toolId: 'spread-rate',
				entryType: 'paving',
				summary: `${tons} t over ${distanceFt} ft @ ${Math.round(placedRate)} lbs/SY`,
				fields: {
					tons_placed: tons,
					distance_ft: distanceFt,
					spread_rate_actual: Math.round(placedRate)
				}
			});
		} else {
			logDraft.clearFor('spread-rate');
		}
	});
	onDestroy(() => logDraft.clearFor('spread-rate'));
</script>

<CalcCard
	title="Spread Rate"
	hideTitle
	purpose="Two numbers side by side: your target rate from the job thickness, and the actual rate from a real load. The badge tells you if you are on spec."
>
	<div class="two-up">
		<div class="col">
			<div class="col-head">Target (from job thickness)</div>
			<NumberField
				label="Custom target (optional)"
				unit="lbs/SY"
				bind:value={customTargetRate}
			/>
			<ResultStat
				value={targetRate != null ? Math.round(targetRate) : null}
				unit="lbs / SY"
				badge={targetBadge}
			/>
			<p class="col-note">
				{#if customTargetRate != null && customTargetRate > 0}
					Using custom target. Clear to use thickness-based rate.
				{:else}
					Set thickness in Job Setup. Weather bar sets air temp for Table 4.
				{/if}
			</p>
		</div>

		<div class="col">
			<div class="col-head">Actual (from a real load)</div>
			<NumberField label="Tons placed" unit="tons" bind:value={tons} />
			<NumberField label="Distance covered" unit="ft" bind:value={distanceFt} />
			<ResultStat
				value={placedRate != null ? Math.round(placedRate) : null}
				unit="lbs / SY"
				badge={badge}
			/>
		</div>
	</div>

	{#if placedRate != null && targetRate != null}
		<SpreadRateGauge actual={placedRate} target={targetRate} toleranceLbsSy={tolerance.toleranceLbsSy} />
		{#if spec}
			<p class="spec-note {spec.status}">{spec.message}</p>
		{/if}
	{/if}

	<ShowWork>
		<p>Target uses the field rule-of-thumb:</p>
		<code>rate = thickness(in) × {multMeta.value}  →  {job.thicknessIn} × {multMeta.value} = {targetRate != null ? Math.round(targetRate) : '—'} lbs/SY</code>
		<p>Actual converts a real load over the area paved:</p>
		<code>rate = (tons − retained) × 2000 ÷ (length × width ÷ 9)</code>
		<p>
			In-spec is judged against GDOT Section 400 Table 12 — for a
			<b>{tolerance.label}</b> the placed rate must stay within
			<b>±{tolerance.toleranceLbsSy} lbs/SY</b> of the target.
		</p>
		<div class="src-row">Thickness × 110 multiplier: <SourceBadge status={multMeta.status} tier={multMeta.tier} /></div>
		<div class="src-row">Table 12 tolerance (±{tolerance.toleranceLbsSy} lbs/SY): <SourceBadge status={tolerance.status} tier={tolerance.tier} /></div>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.btn-clear {
		width: 100%;
		min-height: 3rem;
		padding: 0.75rem;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-clear:hover {
		background: var(--surface-alt);
		color: var(--text);
	}


	.two-up {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.col-head {
		font-size: 0.78rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		margin-bottom: 8px;
	}
	.col-note {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 6px 0 0;
	}
	.spec-note {
		font-size: 0.78rem;
		margin: 10px 0 0;
		padding: 8px 10px;
		border-radius: 8px;
		line-height: 1.35;
	}
	.spec-note.good {
		background: color-mix(in srgb, var(--good) 16%, transparent);
		color: var(--good);
	}
	.spec-note.warn {
		background: color-mix(in srgb, var(--warn) 16%, transparent);
		color: var(--warn);
	}
	.spec-note.bad {
		background: color-mix(in srgb, var(--bad) 16%, transparent);
		color: var(--bad);
	}
	@media (max-width: 460px) {
		.two-up {
			grid-template-columns: 1fr;
		}
	}
</style>

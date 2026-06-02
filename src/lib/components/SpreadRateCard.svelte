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
	let overrideExpanded = $state(false);

	// Guard: if override section is collapsed, clear custom rate immediately
	$effect(() => {
		if (!overrideExpanded) {
			customTargetRate = null;
		}
	});

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

			<button
				type="button"
				class="override-toggle"
				onclick={() => { overrideExpanded = !overrideExpanded; }}
				aria-expanded={overrideExpanded}
			>
				<svg
					class="chevron"
					class:expanded={overrideExpanded}
					width="16"
					height="16"
					viewBox="0 0 16 16"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
				Override target rate
			</button>

			{#if overrideExpanded}
				<div class="override-section">
					<NumberField
						label="Custom target"
						unit="lbs/SY"
						bind:value={customTargetRate}
					/>
				</div>
			{/if}

			<ResultStat
				value={targetRate != null ? Math.round(targetRate) : null}
				unit="lbs / SY"
				badge={targetBadge}
			/>

			{#if customTargetRate != null && customTargetRate > 0}
				<div class="warning-banner">
					<div class="warning-content">
						<svg class="warning-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M8 1L15 14H1L8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
							<path d="M8 6V9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
							<circle cx="8" cy="11.5" r="0.75" fill="currentColor"/>
						</svg>
						<span class="warning-text">Custom target active — thickness-based rate is overridden.</span>
					</div>
					<button
						type="button"
						class="clear-button"
						onclick={() => {
							customTargetRate = null;
							overrideExpanded = false;
						}}
						aria-label="Clear custom target"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
							<path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
						</svg>
						Clear
					</button>
				</div>
			{:else}
				<p class="col-note">
					Set thickness in Job Setup. Weather bar sets air temp for Table 4.
				</p>
			{/if}
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
</CalcCard>

<style>
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
	.override-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		width: 100%;
		padding: 12px;
		margin-bottom: 8px;
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
		border-radius: 8px;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.override-toggle:hover {
		background: color-mix(in srgb, var(--surface-2) 50%, transparent);
		border-color: var(--text-muted);
	}
	.override-toggle:active {
		transform: scale(0.98);
	}
	.chevron {
		transition: transform 0.2s ease;
		flex-shrink: 0;
	}
	.chevron.expanded {
		transform: rotate(180deg);
	}
	.override-section {
		margin-bottom: 12px;
	}
	.warning-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin: 8px 0 0;
		padding: 12px;
		background: color-mix(in srgb, var(--warn) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
		border-radius: 8px;
	}
	.warning-content {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		flex: 1;
	}
	.warning-icon {
		color: #f2c037;
		flex-shrink: 0;
		margin-top: 2px;
	}
	.warning-text {
		font-size: 0.75rem;
		line-height: 1.4;
		color: var(--warn);
		font-weight: 500;
	}
	.clear-button {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		min-width: 48px;
		padding: 10px 14px;
		background: color-mix(in srgb, var(--surface-2) 80%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		border-radius: 6px;
		color: var(--warn);
		font-size: 0.8125rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}
	.clear-button:hover {
		background: color-mix(in srgb, var(--surface-2) 100%, transparent);
		border-color: var(--warn);
	}
	.clear-button:active {
		transform: scale(0.96);
	}
	.clear-button svg {
		flex-shrink: 0;
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

<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import SpreadRateGauge from './SpreadRateGauge.svelte';
	import DotTable from './DotTable.svelte';
	import SpecAlert from './SpecAlert.svelte';
	import HelpTip from './HelpTip.svelte';
	import Tooltip from './ui/Tooltip.svelte';
	import CalculationStep from './ui/CalculationStep.svelte';
	import CalcProofButton from './CalcProofButton.svelte';
	import type { CalcProofData } from '$lib/utils/pdf-export';
	import { constantMeta, placementCheck, rainCheck, spreadSpecCheck, spreadToleranceFor } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { spreadRateFromThickness, spreadRatePlaced } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { calcHistory } from '$lib/stores/calcHistory.svelte';
	import { onDestroy } from 'svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import {
		UNIT_LABELS,
		fromKgPerM2,
		fromMeters,
		fromMetricTonnes,
		toKgPerM2,
		toMetricTonnes
	} from '$lib/utils/unitConvert';

	// Reality-check inputs (local to this calc; width/thickness/machine are shared).
	let tonsInput = $state<number | null>(null);
	let distanceInput = $state<number | null>(null);
	let customTargetRateInput = $state<number | null>(null);
	let overrideExpanded = $state(false);
	let guidanceExpanded = $state(false);

	// Guard: if override section is collapsed, clear custom rate immediately
	$effect(() => {
		if (!overrideExpanded) {
			customTargetRateInput = null;
		}
	});

	const tons = $derived(
		tonsInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(tonsInput)
			: tonsInput
	);
	const distanceFt = $derived(
		distanceInput != null && unitsStore.system === 'metric'
			? fromMeters(distanceInput)
			: distanceInput
	);
	const customTargetRate = $derived(
		customTargetRateInput != null && unitsStore.system === 'metric'
			? fromKgPerM2(customTargetRateInput)
			: customTargetRateInput
	);

	function clearInputs() {
		tonsInput = null;
		distanceInput = null;
		customTargetRateInput = null;
		logDraft.clearFor('spread-rate');
	}

	const targetRate = $derived(
		customTargetRate != null && customTargetRate > 0
			? customTargetRate
			: calcContext.lift_thickness.value > 0
				? spreadRateFromThickness(calcContext.lift_thickness.value)
				: null
	);

	const placedRate = $derived(
		tons && distanceFt && calcContext.road_width.value
			? spreadRatePlaced({
					tons,
					lengthFt: distanceFt,
					widthFt: calcContext.road_width.value,
					machineId: job.machineId,
					firstPass: job.firstPass
				})
			: null
	);

	const displayTargetRate = $derived(
		targetRate != null && unitsStore.system === 'metric' ? toKgPerM2(targetRate) : targetRate
	);
	const displayPlacedRate = $derived(
		placedRate != null && unitsStore.system === 'metric' ? toKgPerM2(placedRate) : placedRate
	);

	const tolerance = $derived(spreadToleranceFor(calcContext.course_type.value));
	const spec = $derived(spreadSpecCheck(placedRate, targetRate, calcContext.course_type.value));

	const badge = $derived(
		spec ? { kind: spec.status, text: spec.label } : null
	);

	const inspectorStats = $derived.by(() => {
		if (placedRate == null || targetRate == null) return undefined;

		const variance = placedRate - targetRate;
		const varianceStr = `${variance > 0 ? '+' : ''}${variance.toFixed(1)}`;

		return [
			{
				label: 'Target Rate',
				value: Math.round(displayTargetRate ?? targetRate).toString(),
				unit: UNIT_LABELS.lbsSy[unitsStore.system],
				highlight: spec?.status === 'good',
				status: null as 'good' | 'warn' | 'bad' | null
			},
			{
				label: 'Actual Rate',
				value: Math.round(displayPlacedRate ?? placedRate).toString(),
				unit: UNIT_LABELS.lbsSy[unitsStore.system],
				highlight: false,
				status: (spec?.status === 'good' ? 'good' : spec?.status === 'warn' ? 'warn' : spec?.status === 'bad' ? 'bad' : null) as 'good' | 'warn' | 'bad' | null
			},
			{
				label: 'Variance',
				value: varianceStr,
				unit: UNIT_LABELS.lbsSy[unitsStore.system],
				highlight: false,
				status: null as 'good' | 'warn' | 'bad' | null
			},
			{
				label: 'Width',
				value: calcContext.road_width.value.toFixed(1),
				unit: UNIT_LABELS.ft[unitsStore.system],
				highlight: false,
				status: null as 'good' | 'warn' | 'bad' | null
			}
		];
	});

	const multMeta = constantMeta('CONST.THICK_MULT');
	const placement = $derived(placementCheck(weather.effectiveTempF, calcContext.lift_thickness.value));
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

	// ── History recording ─────────────────────────────────────────────────
	let _lastSpreadRecorded = $state<string | null>(null);
	$effect(() => {
		if (placedRate == null) return;
		const resultStr = `${Math.round(placedRate)} lbs/SY placed`;
		if (resultStr === _lastSpreadRecorded) return;
		_lastSpreadRecorded = resultStr;
		const w = calcContext.road_width.value;
		calcHistory.add({
			toolId: 'spread-rate',
			toolLabel: 'Spread Rate',
			result: resultStr,
			summary: `${tonsInput ?? '?'} tons \u00b7 ${distanceInput ?? '?'}ft \u00b7 ${w}ft wide`
		});
	});

	function snapToTarget() {
		if (targetRate != null && distanceFt && calcContext.road_width.value) {
			const areaYards = (distanceFt * calcContext.road_width.value) / 9;
			const adjustedTons = Math.round(((targetRate * areaYards) / 2000) * 100) / 100;
			tonsInput =
				unitsStore.system === 'metric' ? toMetricTonnes(adjustedTons) : adjustedTons;
		}
	}

	function getProofData(): CalcProofData | null {
		if (!tons || !distanceFt || !calcContext.road_width.value || targetRate == null || placedRate == null) {
			return null;
		}

		const areaYards = (distanceFt * calcContext.road_width.value) / 9;
		const pounds = tons * 2000;
		const variance = placedRate - targetRate;

		return {
			title: 'Spread Rate',
			inputs: {
				'Tons placed': `${tons.toFixed(2)} tons`,
				'Distance covered': `${distanceFt.toFixed(0)} ft`,
				'Mat width': `${calcContext.road_width.value.toFixed(0)} ft`
			},
			steps: [
				{
					step: 1,
					label: 'Area in square yards',
					formula: `${distanceFt.toFixed(0)} × ${calcContext.road_width.value.toFixed(0)} ÷ 9`,
					result: `${areaYards.toFixed(2)} SY`
				},
				{
					step: 2,
					label: 'Pounds placed',
					formula: `${tons.toFixed(2)} × 2000`,
					result: `${pounds.toFixed(0)} lbs`
				},
				{
					step: 3,
					label: 'Placed rate',
					formula: `${pounds.toFixed(0)} ÷ ${areaYards.toFixed(2)}`,
					result: `${Math.round(placedRate)} lbs/SY`
				},
				{
					step: 4,
					label: 'Target rate',
					formula: `${calcContext.lift_thickness.value.toFixed(2)} × 110`,
					result: `${Math.round(targetRate)} lbs/SY`
				},
				{
					step: 5,
					label: 'Variance',
					formula: `${Math.round(placedRate)} − ${Math.round(targetRate)}`,
					result: `${variance > 0 ? '+' : ''}${variance.toFixed(1)} lbs/SY`
				}
			],
			result: {
				value: Math.round(placedRate).toString(),
				unit: 'lbs/SY'
			},
			notes: `Target uses thickness × 110 rule. In-spec tolerance: ±${tolerance.toleranceLbsSy} lbs/SY for ${tolerance.label}.`,
			jobContext: {
				width: calcContext.road_width.value,
				thickness: calcContext.lift_thickness.value,
				rate: Math.round(targetRate)
			}
		};
	}
</script>

<CalcCard
	title="Spread Rate"
	hideTitle
	purpose="Two numbers side by side: your target rate from the job thickness, and the actual rate from a real load. The badge tells you if you are on spec."
>
	<div class="two-up">
		<div class="col">
			<div class="col-head label-row">
				Target (from job thickness)
				<Tooltip term="lbs/SY" definition="Pounds per Square Yard. Standard unit for spread rate (how much asphalt per area). Controls thickness and density of the asphalt mat." />
			</div>

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
						unit={UNIT_LABELS.lbsSy[unitsStore.system]}
						bind:value={customTargetRateInput}
					/>
				</div>
			{/if}

			<ResultStat
				value={displayTargetRate != null ? Math.round(displayTargetRate) : null}
				unit={UNIT_LABELS.lbsSy[unitsStore.system]}
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
							customTargetRateInput = null;
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
			<div class="col-head label-row">
				Actual (from a real load)
				<HelpTip text="How many pounds of asphalt you actually laid per square yard, calculated from tons placed over the area." />
			</div>
			<NumberField
				label="Tons placed"
				unit={UNIT_LABELS.tons[unitsStore.system]}
				bind:value={tonsInput}
				hint="Enter actual weight from load ticket"
			/>
			<NumberField
				label="Distance covered"
				unit={UNIT_LABELS.ft[unitsStore.system]}
				bind:value={distanceInput}
			/>
			<ResultStat
				value={displayPlacedRate != null ? Math.round(displayPlacedRate) : null}
				unit={UNIT_LABELS.lbsSy[unitsStore.system]}
				badge={badge}
			/>
		</div>
	</div>

	{#if placedRate != null && targetRate != null}
		<SpreadRateGauge actual={placedRate} target={targetRate} toleranceLbsSy={tolerance.toleranceLbsSy} />
		{#if spec}
			<SpecAlert status={spec.status} message={spec.message} clause={spec.clause} clauseTitle={spec.clauseTitle} guidance={spec.guidance} />
			{#if spec.status === 'warn' || spec.status === 'bad'}
				<button
					type="button"
					class="guidance-toggle"
					onclick={() => { guidanceExpanded = !guidanceExpanded; }}
					aria-expanded={guidanceExpanded}
				>
					<svg
						class="chevron"
						class:expanded={guidanceExpanded}
						width="16"
						height="16"
						viewBox="0 0 16 16"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					What should I do?
				</button>
				{#if guidanceExpanded}
					<div class="guidance-section">
						<ul class="guidance-list">
							<li>Notify foreman immediately</li>
							<li>Check screed settings and verify proper float</li>
							<li>Verify mix ticket matches job specs</li>
							<li>Adjust paver speed if laying too thick or thin</li>
						</ul>
					</div>
				{/if}
				{#if distanceFt && calcContext.road_width.value}
					<button type="button" class="snap-btn" onclick={snapToTarget}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
						</svg>
						Snap to spec
					</button>
				{/if}
			{/if}
		{/if}
	{/if}

	<ShowWork stepCount={5} inspectorStats={inspectorStats} inspectorTitle="Spread Rate Check">
		{#if tons && distanceFt && calcContext.road_width.value && targetRate != null && placedRate != null}
			{@const areaYards = (distanceFt * calcContext.road_width.value) / 9}
			{@const pounds = tons * 2000}
			{@const variance = placedRate - targetRate}

			<CalculationStep
				step={1}
				label="Area in square yards"
				formula="{distanceFt.toFixed(0)} × {calcContext.road_width.value.toFixed(0)} ÷ 9"
				result="{areaYards.toFixed(2)} SY"
			/>
			<CalculationStep
				step={2}
				label="Pounds placed"
				formula="{tons.toFixed(2)} × 2000"
				result="{pounds.toFixed(0)} lbs"
			/>
			<CalculationStep
				step={3}
				label="Placed rate"
				formula="{pounds.toFixed(0)} ÷ {areaYards.toFixed(2)}"
				result="{Math.round(placedRate)} lbs/SY"
			/>
			<CalculationStep
				step={4}
				label="Target rate"
				formula="{calcContext.lift_thickness.value.toFixed(2)} × 110"
				result="{Math.round(targetRate)} lbs/SY"
			/>
			<CalculationStep
				step={5}
				label="Variance"
				formula="{Math.round(placedRate)} − {Math.round(targetRate)}"
				result="{variance > 0 ? '+' : ''}{variance.toFixed(1)} lbs/SY"
			/>

			<CalcProofButton title="Spread Rate" getData={getProofData} />
		{:else}
			<p>Target uses the field rule-of-thumb:</p>
			<code>rate = thickness(in) × {multMeta.value}</code>
			<p>Actual converts a real load over the area paved:</p>
			<code>rate = (tons × 2000) ÷ (length × width ÷ 9)</code>
			<p>Enter values above to see step-by-step calculation.</p>
		{/if}

		<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
			<p>
				In-spec is judged against GDOT Section 400 Table 12 — for a
				<b>{tolerance.label}</b> the placed rate must stay within
				<b>±{tolerance.toleranceLbsSy} lbs/SY</b> of the target.
			</p>
			<div class="src-row">Thickness × 110 multiplier: <SourceBadge status={multMeta.status} tier={multMeta.tier} /></div>
			<div class="src-row">Table 12 tolerance (±{tolerance.toleranceLbsSy} lbs/SY): <SourceBadge status={tolerance.status} tier={tolerance.tier} /></div>
			<DotTable tableId="table-12" highlightRow={calcContext.course_type.value} />
		</div>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.two-up {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
	}
	.col-head {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}
	.label-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.col-note {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin: var(--sp-2) 0 0;
	}
	.override-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--touch);
		width: 100%;
		padding: var(--sp-3);
		margin-bottom: var(--sp-2);
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
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
		margin-bottom: var(--sp-3);
	}
	.warning-banner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		margin: var(--sp-2) 0 0;
		padding: var(--sp-3);
		background: color-mix(in srgb, var(--warn) 16%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 40%, transparent);
		border-radius: var(--radius-sm);
	}
	.warning-content {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-2);
		flex: 1;
	}
	.warning-icon {
		color: var(--accent);
		flex-shrink: 0;
		margin-top: 2px;
	}
	.warning-text {
		font-size: var(--fs-xs);
		line-height: 1.4;
		color: var(--warn);
		font-weight: var(--fw-medium);
	}
	.clear-button {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--touch);
		min-width: var(--touch);
		padding: var(--sp-3) var(--sp-4);
		background: color-mix(in srgb, var(--surface-2) 80%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		border-radius: var(--radius-sm);
		color: var(--warn);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
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
	.snap-btn {
		margin-top: var(--sp-2);
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		padding: var(--sp-3);
		min-height: var(--touch);
		background: var(--surface-alt);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.15s;
	}
	.snap-btn:hover {
		background: var(--surface-hover);
	}
	.snap-btn:active {
		transform: scale(0.98);
	}
	.snap-btn svg {
		width: 16px;
		height: 16px;
	}
	.guidance-toggle {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-height: var(--touch);
		width: 100%;
		padding: var(--sp-3);
		margin-top: var(--sp-2);
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		border-radius: var(--radius-sm);
		color: var(--warn);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.guidance-toggle:hover {
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		border-color: var(--warn);
	}
	.guidance-toggle:active {
		transform: scale(0.98);
	}
	.guidance-section {
		margin-top: var(--sp-2);
		padding: var(--sp-3);
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent);
		border-radius: var(--radius-sm);
	}
	.guidance-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}
	.guidance-list li {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-2);
		font-size: var(--fs-sm);
		line-height: 1.4;
		color: var(--text);
	}
	.guidance-list li:before {
		content: '•';
		color: var(--warn);
		font-weight: var(--fw-bold);
		flex-shrink: 0;
	}
	@media (max-width: 460px) {
		.two-up {
			grid-template-columns: 1fr;
		}
	}
</style>

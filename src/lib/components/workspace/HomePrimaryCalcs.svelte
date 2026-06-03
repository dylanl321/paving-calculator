<script lang="ts">
	import NumberField from '$lib/components/NumberField.svelte';
	import ResultStat from '$lib/components/ResultStat.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { spreadRateFromThickness, spreadRatePlaced, feetFromTons } from '$lib/config/formulas';
	import { constant, spreadSpecCheck } from '$lib/config';
	import { unitsStore } from '$lib/stores/units.svelte';
	import {
		UNIT_LABELS,
		fromMetricTonnes,
		fromMeters,
		toKgPerM2,
		toMetricTonnes,
		toMeters
	} from '$lib/utils/unitConvert';

	// ── Spread Rate inputs ──────────────────────────────────────────────────
	let tonsInput = $state<number | null>(null);
	let distanceInput = $state<number | null>(null);

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

	const targetRate = $derived(
		job.thicknessIn > 0 ? spreadRateFromThickness(job.thicknessIn) : null
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

	const displayTargetRate = $derived(
		targetRate != null && unitsStore.system === 'metric' ? toKgPerM2(targetRate) : targetRate
	);
	const displayPlacedRate = $derived(
		placedRate != null && unitsStore.system === 'metric' ? toKgPerM2(placedRate) : placedRate
	);

	const spec = $derived(spreadSpecCheck(placedRate, targetRate, job.courseType));
	const specBadge = $derived(
		spec ? ({ kind: spec.status, text: spec.label } as const) : null
	);

	// ── Tons to Reach inputs ────────────────────────────────────────────────
	let reachDistanceInput = $state<number | null>(null);

	const reachDistanceFt = $derived(
		reachDistanceInput != null && unitsStore.system === 'metric'
			? fromMeters(reachDistanceInput)
			: reachDistanceInput
	);

	const rate = $derived(job.thicknessIn > 0 ? spreadRateFromThickness(job.thicknessIn) : 0);

	// tons = distance * width * rate / (LB_PER_TON * SF_PER_SY)
	const tonsNeeded = $derived(
		reachDistanceFt != null && rate > 0 && job.widthFt > 0
			? (reachDistanceFt * job.widthFt * rate) /
					(constant('CONST.LB_PER_TON') * constant('CONST.SF_PER_SY'))
			: null
	);

	const displayTonsNeeded = $derived(
		tonsNeeded != null && unitsStore.system === 'metric' ? toMetricTonnes(tonsNeeded) : tonsNeeded
	);

	// Also show how far current available tons will reach (optional helper)
	let availableTonsInput = $state<number | null>(null);
	const availableTons = $derived(
		availableTonsInput != null && unitsStore.system === 'metric'
			? fromMetricTonnes(availableTonsInput)
			: availableTonsInput
	);
	const availableReachFt = $derived(
		availableTons != null && rate > 0 && job.widthFt > 0
			? feetFromTons(availableTons, job.widthFt, rate)
			: null
	);
	const displayAvailableReach = $derived(
		availableReachFt != null && unitsStore.system === 'metric'
			? toMeters(availableReachFt)
			: availableReachFt
	);
</script>

<div class="home-calcs">
	<!-- ── Spread Rate ─────────────────────────────────────────────────── -->
	<div class="calc-panel">
		<div class="panel-head">
			<span class="panel-icon">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M22 12H2"/>
					<path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>
					<line x1="6" y1="16" x2="6.01" y2="16"/>
					<line x1="10" y1="16" x2="10.01" y2="16"/>
				</svg>
			</span>
			<h2 class="panel-title">Spread Rate</h2>
		</div>
		<p class="panel-sub">Target vs. actual from a real load</p>

		{#if targetRate != null}
			<div class="target-chip">
				<span class="chip-label">Target</span>
				<span class="chip-value">
					{Math.round(displayTargetRate ?? targetRate)}
					<span class="chip-unit">{UNIT_LABELS.lbsSy[unitsStore.system]}</span>
				</span>
			</div>
		{:else}
			<div class="setup-hint">Set thickness in Job Setup to see target rate</div>
		{/if}

		<div class="fields-row">
			<NumberField
				label="Tons placed"
				unit={UNIT_LABELS.tons[unitsStore.system]}
				bind:value={tonsInput}
				hint="From load ticket"
			/>
			<NumberField
				label="Distance covered"
				unit={UNIT_LABELS.ft[unitsStore.system]}
				bind:value={distanceInput}
			/>
		</div>

		<ResultStat
			value={displayPlacedRate != null ? Math.round(displayPlacedRate) : null}
			unit={UNIT_LABELS.lbsSy[unitsStore.system]}
			badge={specBadge}
		/>

		{#if tonsInput || distanceInput}
			<button
				type="button"
				class="clear-link"
				onclick={() => { tonsInput = null; distanceInput = null; }}
			>
				Clear
			</button>
		{/if}
	</div>

	<!-- ── Tons to Reach ──────────────────────────────────────────────── -->
	<div class="calc-panel">
		<div class="panel-head">
			<span class="panel-icon">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="10"/>
					<polyline points="12 6 12 12 16 14"/>
				</svg>
			</span>
			<h2 class="panel-title">Tons to Reach</h2>
		</div>
		<p class="panel-sub">How many tons to hit a target distance</p>

		<NumberField
			label="Available tons on hand"
			unit={UNIT_LABELS.tons[unitsStore.system]}
			bind:value={availableTonsInput}
			hint="Plant silo + trucks en route"
		/>

		{#if displayAvailableReach != null}
			<div class="reach-chip">
				<span class="chip-label">Will reach</span>
				<span class="chip-value accent">
					{Math.round(displayAvailableReach).toLocaleString()}
					<span class="chip-unit">{UNIT_LABELS.ft[unitsStore.system]}</span>
				</span>
			</div>
		{/if}

		<div class="divider-thin"></div>

		<NumberField
			label="Desired distance to cover"
			unit={UNIT_LABELS.ft[unitsStore.system]}
			bind:value={reachDistanceInput}
		/>

		<ResultStat
			value={displayTonsNeeded != null ? Math.round(displayTonsNeeded).toLocaleString() : null}
			unit={`${UNIT_LABELS.tons[unitsStore.system]} needed`}
		/>

		{#if availableTonsInput || reachDistanceInput}
			<button
				type="button"
				class="clear-link"
				onclick={() => { availableTonsInput = null; reachDistanceInput = null; }}
			>
				Clear
			</button>
		{/if}
	</div>
</div>

<style>
	.home-calcs {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
	}

	@media (max-width: 580px) {
		.home-calcs {
			grid-template-columns: 1fr;
		}
	}

	.calc-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.panel-head {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.panel-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		border-radius: var(--radius-sm);
		color: var(--accent);
		flex-shrink: 0;
	}

	.panel-title {
		font-size: var(--fs-md);
		font-weight: var(--fw-heavy);
		margin: 0;
		line-height: 1.2;
	}

	.panel-sub {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin: 0;
		margin-top: calc(-1 * var(--sp-1));
	}

	.target-chip,
	.reach-chip {
		display: flex;
		align-items: baseline;
		gap: var(--sp-2);
		padding: var(--sp-2) var(--sp-3);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		border-radius: var(--radius-sm);
	}

	.chip-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-weight: var(--fw-medium);
		text-transform: uppercase;
		letter-spacing: 0.4px;
	}

	.chip-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-heavy);
		color: var(--text);
		line-height: 1;
	}

	.chip-value.accent {
		color: var(--accent);
	}

	.chip-unit {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		font-weight: var(--fw-regular);
		margin-left: 2px;
	}

	.setup-hint {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		padding: var(--sp-2) var(--sp-3);
		border: 1px dashed var(--border);
		border-radius: var(--radius-sm);
	}

	.fields-row {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.divider-thin {
		height: 1px;
		background: var(--border);
		margin: var(--sp-1) 0;
	}

	.clear-link {
		background: none;
		border: none;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		cursor: pointer;
		padding: var(--sp-1) 0;
		text-align: left;
		min-height: var(--touch);
		display: flex;
		align-items: center;
	}

	.clear-link:hover {
		color: var(--text);
	}
</style>

<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import ResultStat from './ResultStat.svelte';
	import SpreadRateGauge from './SpreadRateGauge.svelte';
	import SpecAlert from './SpecAlert.svelte';
	import HelpTip from './HelpTip.svelte';
	import SourceTag from './SourceTag.svelte';
	import { spreadSpecCheck, spreadToleranceFor } from '$lib/config';
	import { today } from '$lib/stores/today.svelte';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { spreadRateFromThickness, actualSpreadRate } from '$lib/config/formulas';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { UNIT_LABELS, toKgPerM2 } from '$lib/utils/unitConvert';

	let batchSize = $state(3);

	const pavingEntries = $derived(
		today.entries.filter(e => e.entry_type === 'paving' && e.tons_placed != null && e.distance_ft != null)
	);

	const lastNEntries = $derived(
		pavingEntries.slice(-batchSize)
	);

	const aggregateTons = $derived(
		lastNEntries.reduce((sum, e) => sum + (e.tons_placed ?? 0), 0)
	);

	const aggregateDistanceFt = $derived(
		lastNEntries.reduce((sum, e) => sum + (e.distance_ft ?? 0), 0)
	);

	const targetRate = $derived(
		calcContext.lift_thickness.value > 0 ? spreadRateFromThickness(calcContext.lift_thickness.value) : null
	);

	const aggregateRate = $derived(
		aggregateTons > 0 && aggregateDistanceFt > 0 && calcContext.road_width.value > 0
			? actualSpreadRate({
					tons: aggregateTons,
					distanceFt: aggregateDistanceFt,
					widthFt: calcContext.road_width.value
				})
			: null
	);

	const displayTargetRate = $derived(
		targetRate != null && unitsStore.system === 'metric' ? toKgPerM2(targetRate) : targetRate
	);

	const displayAggregateRate = $derived(
		aggregateRate != null && unitsStore.system === 'metric' ? toKgPerM2(aggregateRate) : aggregateRate
	);

	const tolerance = $derived(spreadToleranceFor(calcContext.course_type.value));
	const spec = $derived(spreadSpecCheck(aggregateRate, targetRate, calcContext.course_type.value));

	const badge = $derived(
		spec ? { kind: spec.status, text: spec.label } : null
	);

	function increment() {
		if (batchSize < Math.min(10, pavingEntries.length)) {
			batchSize++;
		}
	}

	function decrement() {
		if (batchSize > 2) {
			batchSize--;
		}
	}
</script>

<CalcCard
	title="Batch Spread Rate Check"
	purpose="Aggregate the last N loads to see the composite spread rate vs target spec. Perfect for spotting trends across multiple loads."
>
	<div class="card-title-with-help">
		<span>Batch Spread Rate Check</span>
		<HelpTip text="Checks the aggregate spread rate across the last N loads. Useful for catching systematic over- or under-application." />
	</div>
	{#if pavingEntries.length < 2}
		<div class="empty-state">
			<svg class="empty-icon" width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M24 4L44 14V34L24 44L4 34V14L24 4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
				<path d="M24 24V44" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
				<path d="M4 14L24 24L44 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
			</svg>
			<div class="empty-text">No loads logged yet</div>
			<div class="empty-hint">Log at least 2 paving entries to use batch checks</div>
		</div>
	{:else}
		<div class="batch-controls">
			<div class="control-label">Last N loads to aggregate</div>
			<div class="stepper">
				<button
					type="button"
					class="stepper-btn"
					onclick={decrement}
					disabled={batchSize <= 2}
					aria-label="Decrease batch size"
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
				<div class="stepper-value">{batchSize}</div>
				<button
					type="button"
					class="stepper-btn"
					onclick={increment}
					disabled={batchSize >= Math.min(10, pavingEntries.length)}
					aria-label="Increase batch size"
				>
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
					</svg>
				</button>
			</div>
		</div>

		<div class="summary-grid">
			<div class="summary-item">
				<div class="summary-label">Loads selected</div>
				<div class="summary-value">{lastNEntries.length}</div>
			</div>
			<div class="summary-item">
				<div class="summary-label">Total tons</div>
				<div class="summary-value">{aggregateTons.toFixed(1)}</div>
			</div>
			<div class="summary-item">
				<div class="summary-label">Total distance</div>
				<div class="summary-value">{Math.round(aggregateDistanceFt)} {UNIT_LABELS.ft.imperial}</div>
			</div>
		</div>

		<div class="results-grid">
			<div class="result-col">
				<div class="result-head">Target</div>
				<ResultStat
					value={displayTargetRate != null ? Math.round(displayTargetRate) : null}
					unit={UNIT_LABELS.lbsSy[unitsStore.system]}
				/>
			</div>
			<div class="result-col">
				<div class="result-head">Aggregate Actual</div>
				<ResultStat
					value={displayAggregateRate != null ? Math.round(displayAggregateRate) : null}
					unit={UNIT_LABELS.lbsSy[unitsStore.system]}
					badge={badge}
				/>
			</div>
		</div>

		<div class="source-row">
			<SourceTag source={calcContext.road_width.source} updatedAt={calcContext.road_width.updatedAt} label="Width" />
			<SourceTag source={calcContext.lift_thickness.source} updatedAt={calcContext.lift_thickness.updatedAt} label="Thickness" />
			<SourceTag source={calcContext.course_type.source} updatedAt={calcContext.course_type.updatedAt} label="Course" />
		</div>

		{#if aggregateRate != null && targetRate != null}
			<SpreadRateGauge actual={aggregateRate} target={targetRate} toleranceLbsSy={tolerance.toleranceLbsSy} />
			{#if spec}
				<SpecAlert status={spec.status} message={spec.message} clause={spec.clause} clauseTitle={spec.clauseTitle} guidance={spec.guidance} />
			{/if}
		{/if}

		<div class="entry-list">
			<div class="entry-list-head">Selected loads</div>
			{#each lastNEntries as entry, i}
				<div class="entry-row">
					<div class="entry-num">{lastNEntries.length - i}</div>
					<div class="entry-details">
						<span class="entry-time">{entry.timestamp}</span>
						<span class="entry-data">{entry.tons_placed} t × {entry.distance_ft} ft</span>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</CalcCard>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: var(--sp-8) var(--sp-4);
		text-align: center;
	}
	.empty-icon {
		color: var(--text-muted);
		opacity: 0.5;
		margin-bottom: var(--sp-4);
	}
	.empty-text {
		font-size: var(--fs-lg);
		font-weight: var(--fw-semibold);
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}
	.empty-hint {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		opacity: 0.8;
	}

	.batch-controls {
		margin-bottom: var(--sp-5);
		padding: var(--sp-4);
		background: var(--surface-alt);
		border-radius: var(--radius-sm);
	}
	.control-label {
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		margin-bottom: var(--sp-3);
		text-align: center;
	}
	.stepper {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-4);
	}
	.stepper-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: var(--touch);
		min-height: var(--touch);
		padding: var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		cursor: pointer;
		transition: all 0.15s ease;
	}
	.stepper-btn:hover:not(:disabled) {
		background: var(--surface-hover);
		border-color: var(--accent);
	}
	.stepper-btn:active:not(:disabled) {
		transform: scale(0.95);
	}
	.stepper-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.stepper-value {
		font-size: var(--fs-2xl);
		font-weight: var(--fw-bold);
		color: var(--accent);
		min-width: 64px;
		text-align: center;
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: var(--sp-3);
		margin-bottom: var(--sp-5);
		padding: var(--sp-4);
		background: var(--surface-alt);
		border-radius: var(--radius-sm);
	}
	.summary-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
	}
	.summary-label {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-semibold);
		text-transform: uppercase;
		letter-spacing: 0.3px;
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}
	.summary-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.results-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
	}
	.result-head {
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
		text-align: center;
	}
	.result-col {
		display: flex;
		flex-direction: column;
	}

	.entry-list {
		margin-top: var(--sp-5);
		padding-top: var(--sp-4);
		border-top: 1px solid var(--border);
	}
	.entry-list-head {
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.4px;
		color: var(--text-muted);
		margin-bottom: var(--sp-3);
	}
	.entry-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-3);
		margin-bottom: var(--sp-2);
		background: var(--surface-alt);
		border-radius: var(--radius-sm);
	}
	.entry-num {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 32px;
		min-height: 32px;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: 50%;
		font-size: var(--fs-sm);
		font-weight: var(--fw-bold);
		flex-shrink: 0;
	}
	.entry-details {
		display: flex;
		flex-direction: column;
		gap: var(--sp-1);
		flex: 1;
	}
	.entry-time {
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}
	.entry-data {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}

	.card-title-with-help {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: var(--sp-4);
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}

	.source-row {
		display: flex;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-bottom: var(--sp-4);
	}

	@media (max-width: 460px) {
		.summary-grid {
			grid-template-columns: 1fr;
		}
		.results-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

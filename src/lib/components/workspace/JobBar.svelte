<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/stores';
	import { machines, placementCheck, rainCheck, spreadTolerance, tack } from '$lib/config';
	import { spreadRateFromThickness } from '$lib/config/formulas';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';

	interface Props {
		/** start expanded (used on mobile where it stacks above the tools) */
		startOpen?: boolean;
	}

	let { startOpen = false }: Props = $props();

	let open = $state(untrack(() => startOpen));

	let prevSearch = '';
	$effect(() => {
		const search = $page.url.search;
		if (prevSearch && search !== prevSearch) open = false;
		prevSearch = search;
	});

	const widthFt = $derived(calcContext.road_width.value);
	const thicknessIn = $derived(calcContext.lift_thickness.value);
	const courseType = $derived(calcContext.course_type.value);
	const courseLabel = $derived(
		spreadTolerance.find((course) => course.id === courseType)?.label ?? 'Surface'
	);
	const tackLabel = $derived(tack.field.find((t) => t.id === job.tackApplication)?.label ?? 'Field');
	const targetRate = $derived(thicknessIn > 0 ? Math.round(spreadRateFromThickness(thicknessIn)) : null);
	const placement = $derived(placementCheck(weather.effectiveTempF, thicknessIn));
	const rain = $derived(rainCheck(weather.rainNext24hIn));
	const weatherStatus = $derived.by(() => {
		if (!weather.hasLocation) return { kind: 'none' as const, text: 'Weather optional' };
		if (rain?.status === 'fail' || placement?.status === 'fail') {
			return { kind: 'bad' as const, text: placement?.status === 'fail' ? 'Too cold' : 'Rain hold' };
		}
		if (rain?.status === 'warn' || placement?.status === 'warn') {
			return { kind: 'warn' as const, text: 'Check surface' };
		}
		return {
			kind: 'good' as const,
			text: weather.effectiveTempF != null ? `${weather.effectiveTempF}F OK` : 'Weather OK'
		};
	});

	function setSharedNumber(field: 'road_width' | 'lift_thickness', event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const value = Number(input.value);
		if (Number.isFinite(value) && value > 0) {
			calcContext.setManual(field, value);
		}
	}

	function resetQuickValues() {
		calcContext.clearAllManuals();
		job.reset();
	}
</script>

<div class="quickbar" class:open>
	<button class="summary" type="button" onclick={() => (open = !open)} aria-expanded={open}>
		<span class="summary-main">
			<span class="summary-title">Quick Calculator Settings</span>
			<span class="eyebrow">Saved on this device and reused across calculators</span>
		</span>

		<span class="facts">
			<span class="fact"><b>{widthFt}</b> ft wide</span>
			<span class="dot">·</span>
			<span class="fact"><b>{thicknessIn}"</b> lift</span>
			<span class="dot">·</span>
			<span class="fact">{courseLabel}</span>
			<span class="dot">·</span>
			<span class="rate"><b>{targetRate ?? '-'}</b> lbs/SY target</span>
		</span>

		<span class="wstat {weatherStatus.kind}">{weatherStatus.text}</span>

		<span class="chevron" aria-hidden="true">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="6 9 12 15 18 9" />
			</svg>
		</span>
	</button>

	{#if open}
		<div class="expanded">
			<section class="settings-block primary">
				<div class="block-head">
					<h2>Shared Inputs</h2>
					<p>Set these once. Spread rate, tonnage, feet-left, tack, and related calculators reuse them automatically.</p>
				</div>

				<div class="field-grid">
					<label class="field">
						<span>Road width</span>
						<div class="with-unit">
							<input
								type="number"
								inputmode="decimal"
								min="0"
								step="0.5"
								value={widthFt}
								oninput={(event) => setSharedNumber('road_width', event)}
							/>
							<span class="unit">ft</span>
						</div>
					</label>

					<label class="field">
						<span>Lift thickness</span>
						<div class="with-unit">
							<input
								type="number"
								inputmode="decimal"
								min="0"
								step="0.25"
								value={thicknessIn}
								oninput={(event) => setSharedNumber('lift_thickness', event)}
							/>
							<span class="unit">in</span>
						</div>
					</label>
				</div>

				<div class="field">
					<span>Course type</span>
					<div class="chips">
						{#each spreadTolerance as course (course.id)}
							<button
								type="button"
								class="chip"
								class:active={courseType === course.id}
								onclick={() => calcContext.setManual('course_type', course.id)}
							>
								{course.label}
							</button>
						{/each}
					</div>
				</div>
			</section>

			<section class="settings-block">
				<div class="block-head">
					<h2>Optional Assumptions</h2>
					<p>Only the calculators that need these values will use them.</p>
				</div>

				<div class="field">
					<span>Paver</span>
					<div class="chips">
						{#each machines as machine (machine.id)}
							<button
								type="button"
								class="chip"
								class:active={job.machineId === machine.id}
								onclick={() => (job.machineId = machine.id)}
							>
								{machine.label}
							</button>
						{/each}
					</div>
				</div>

				<label class="check-row">
					<input type="checkbox" bind:checked={job.firstPass} />
					<span>First pass only</span>
				</label>

				<div class="field-grid compact">
					<label class="field">
						<span>Truck load</span>
						<div class="with-unit">
							<input type="number" inputmode="decimal" min="0" step="0.5" bind:value={job.truckLoadTons} />
							<span class="unit">tons</span>
						</div>
					</label>

					<label class="field">
						<span>Waste</span>
						<div class="with-unit">
							<input type="number" inputmode="decimal" min="0" step="0.5" bind:value={job.wastePct} />
							<span class="unit">%</span>
						</div>
					</label>
				</div>

				<div class="field">
					<span>Tack basis</span>
					<div class="chips">
						{#each tack.field as item (item.id)}
							<button
								type="button"
								class="chip"
								class:active={job.tackApplication === item.id}
								onclick={() => (job.tackApplication = item.id)}
							>
								{item.label}
							</button>
						{/each}
					</div>
					<p class="field-hint">Current: {tackLabel}</p>
				</div>
			</section>

			<div class="action-row">
				<p>Changes are kept locally, with no account required.</p>
				<button type="button" class="reset" onclick={resetQuickValues}>Reset calculator values</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.quickbar {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}

	.summary {
		width: 100%;
		display: flex;
		align-items: center;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: transparent;
		border: 0;
		cursor: pointer;
		color: var(--text);
		text-align: left;
	}

	.summary-main {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 190px;
	}

	.summary-title {
		font-size: var(--fs-md);
		font-weight: var(--fw-bold);
	}

	.facts {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		flex: 1;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		flex-wrap: wrap;
	}
	.fact b,
	.rate b {
		color: var(--text);
		font-weight: var(--fw-semibold);
	}
	.rate b {
		color: var(--accent);
	}
	.dot {
		color: var(--border);
	}

	.wstat {
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		padding: 4px 10px;
		border-radius: var(--radius-pill);
		white-space: nowrap;
	}
	.wstat.good {
		background: color-mix(in srgb, var(--good) 18%, transparent);
		color: var(--good);
	}
	.wstat.warn {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.wstat.bad {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
		color: var(--bad);
	}
	.wstat.none {
		background: var(--surface-hover);
		color: var(--text-muted);
	}

	.chevron {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		width: 24px;
		height: 24px;
		transition: transform 0.2s ease;
	}
	.open .chevron {
		transform: rotate(180deg);
	}
	.chevron svg {
		width: 100%;
		height: 100%;
	}

	.expanded {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border-top: 1px solid var(--border);
	}
	@media (min-width: 900px) {
		.expanded {
			grid-template-columns: 1fr 1fr;
		}
	}

	.settings-block {
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: var(--sp-4);
	}
	.settings-block.primary {
		border-color: color-mix(in srgb, var(--accent) 38%, var(--border));
	}
	.block-head {
		margin-bottom: var(--sp-3);
		padding-bottom: var(--sp-3);
		border-bottom: 1px solid var(--border);
	}
	.block-head h2 {
		margin: 0 0 var(--sp-1);
		font-size: var(--fs-md);
	}
	.block-head p,
	.action-row p,
	.field-hint {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-xs);
		line-height: 1.45;
	}

	.field-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--sp-3);
	}
	.field-grid.compact {
		margin: var(--sp-3) 0;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
	}
	.field:last-child {
		margin-bottom: 0;
	}
	.field > span,
	.check-row span {
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
	}

	.with-unit {
		display: flex;
		align-items: center;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		overflow: hidden;
	}
	.with-unit input {
		flex: 1;
		min-width: 0;
		min-height: 48px;
		border: 0;
		background: transparent;
		color: var(--text);
		font-size: 1.05rem;
		font-weight: 700;
		padding: 0 var(--sp-3);
		text-align: right;
	}
	.with-unit input:focus {
		outline: 2px solid var(--accent);
		outline-offset: -2px;
	}
	.unit {
		padding: 0 var(--sp-3);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		white-space: nowrap;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.chip {
		min-height: 48px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--surface);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
	}
	.chip.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.check-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 48px;
		cursor: pointer;
	}
	.check-row input {
		width: 20px;
		height: 20px;
		accent-color: var(--accent);
	}

	.action-row {
		grid-column: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
		padding-top: var(--sp-3);
		border-top: 1px solid var(--border);
	}
	.reset {
		min-height: 48px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		cursor: pointer;
		padding: 0 var(--sp-3);
	}
	.reset:hover {
		color: var(--text);
		background: var(--surface-hover);
	}

	@media (max-width: 760px) {
		.summary {
			align-items: flex-start;
			flex-direction: column;
		}
		.wstat {
			align-self: flex-start;
		}
		.chevron {
			position: absolute;
			right: var(--sp-4);
			top: var(--sp-4);
		}
		.quickbar {
			position: relative;
		}
	}
</style>

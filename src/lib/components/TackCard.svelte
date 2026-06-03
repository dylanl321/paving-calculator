<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import DotTable from './DotTable.svelte';
	import SpecAlert from './SpecAlert.svelte';
	import HelpTip from './HelpTip.svelte';
	import Tooltip from './ui/Tooltip.svelte';
	import CalculationStep from './ui/CalculationStep.svelte';
	import CalcProofButton from './CalcProofButton.svelte';
	import type { CalcProofData } from '$lib/utils/pdf-export';
	import { tack, tackMid, rainCheck, tackTempCheck, weatherConfig } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { tackGallons } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	let lengthFt = $state<number | null>(null);

	function clearInputs() {
		lengthFt = null;
		logDraft.clearFor('tack');
	}

	function getApplicationDescription(label: string): string {
		const descriptions: Record<string, string> = {
			'Leveling': 'For thin leveling courses or minor surface corrections (0.04-0.06 gal/SY)',
			'Topping': 'Standard surface course over existing pavement (0.04-0.06 gal/SY)',
			'OGI (Open-Graded Interlayer)': 'Porous interlayer requiring higher tack rate for proper bonding (0.06-0.08 gal/SY)',
			'Rock Chip': 'Pre-existing rock chip seal coat requiring heavy tack (0.085 gal/SY)'
		};
		return descriptions[label] || 'Standard tack application rate for this surface type';
	}

	const selected = $derived(
		tack.field.find((t) => t.id === job.tackApplication) ?? tack.field[0]
	);

	const area = $derived(lengthFt && job.widthFt ? (lengthFt * job.widthFt) / 9 : null);

	const gallons = $derived.by(() => {
		if (!area) return null;
		return {
			min: tackGallons(lengthFt!, job.widthFt, selected.min),
			mid: tackGallons(lengthFt!, job.widthFt, tackMid(selected)),
			max: tackGallons(lengthFt!, job.widthFt, selected.max)
		};
	});

	const rain = $derived(rainCheck(weather.rainNext24hIn));
	const tempCheck = $derived(tackTempCheck(weather.effectiveTempF));
	const tackBlocked = $derived(
		weatherConfig.wetSurfaceBlocked &&
			(rain?.status === 'fail' || weather.isRaining || tempCheck?.status === 'fail')
	);

	$effect(() => {
		if (gallons != null && !tackBlocked && lengthFt) {
			const mid = Math.round(gallons.mid);
			logDraft.set({
				toolId: 'tack',
				entryType: 'tack',
				summary: `${mid} gal over ${lengthFt} ft (${selected.label})`,
				fields: {
					tack_gallons: mid,
					distance_ft: lengthFt,
					notes: `${selected.label} tack`
				}
			});
		} else {
			logDraft.clearFor('tack');
		}
	});
	onDestroy(() => logDraft.clearFor('tack'));

	function getProofData(): CalcProofData | null {
		if (!lengthFt || !job.widthFt || !gallons) {
			return null;
		}

		const areaYards = (lengthFt * job.widthFt) / 9;
		const midRate = tackMid(selected);

		return {
			title: 'Tack Rate',
			inputs: {
				'Length to shoot': `${lengthFt.toFixed(0)} ft`,
				'Mat width': `${job.widthFt.toFixed(0)} ft`,
				'Application type': selected.label
			},
			steps: [
				{
					step: 1,
					label: 'Area in square yards',
					formula: `${lengthFt.toFixed(0)} × ${job.widthFt.toFixed(0)} ÷ 9`,
					result: `${areaYards.toFixed(2)} SY`
				},
				{
					step: 2,
					label: 'Mid rate',
					formula: `(${selected.min.toFixed(2)} + ${selected.max.toFixed(2)}) ÷ 2`,
					result: `${midRate.toFixed(3)} gal/SY`
				},
				{
					step: 3,
					label: 'Gallons',
					formula: `${areaYards.toFixed(2)} × ${midRate.toFixed(3)}`,
					result: `${Math.round(gallons.mid)} gal`
				}
			],
			result: {
				value: Math.round(gallons.mid).toString(),
				unit: 'gallons'
			},
			notes: `${selected.label} tack application. Rate range: ${selected.min}–${selected.max} gal/SY. Using mid-rate (${midRate.toFixed(3)} gal/SY).`,
			jobContext: {
				width: job.widthFt,
				tackApplication: selected.label
			}
		};
	}</script>

<CalcCard
	title="Tack Rate"
	hideTitle
	purpose="Gallons of tack to shoot for an area. Shows the safe min–max window for the chosen application, with the mid-rate as the suggested amount."
>
	<div class="label-row tack-title">
		<span class="tack-title-text">Tack Rate</span>
		<Tooltip term="Tack Coat" definition="Asphalt emulsion sprayed on existing pavement to bond new layer. Application rate varies by surface condition (typically 0.04-0.12 gal/SY)." />
	</div>
	<NumberField label="Length to shoot" unit="ft" bind:value={lengthFt} />

	<div class="width-note">Using job width: <strong>{job.widthFt} ft</strong></div>

	{#if tempCheck?.status === 'fail'}
		<SpecAlert status="fail" message={tempCheck.message} clause={tempCheck.clause} clauseTitle={tempCheck.clauseTitle} guidance={tempCheck.guidance} />
	{:else if tempCheck?.status === 'warn'}
		<SpecAlert status="warn" message={tempCheck.message} clause={tempCheck.clause} clauseTitle={tempCheck.clauseTitle} guidance={tempCheck.guidance} />
	{:else if tempCheck?.status === 'pass'}
		<SpecAlert status="pass" message={tempCheck.message} clause={tempCheck.clause} clauseTitle={tempCheck.clauseTitle} guidance={tempCheck.guidance} />
	{/if}

	{#if rain?.status === 'fail'}
		<SpecAlert status="fail" message={rain.message} clause={rain.clause} clauseTitle={rain.clauseTitle} guidance={rain.guidance} />
	{:else if rain?.status === 'warn'}
		<SpecAlert status="warn" message={rain.message} clause={rain.clause} clauseTitle={rain.clauseTitle} guidance={rain.guidance} />
	{/if}

	{#if weather.isRaining}
		<div class="weather-warn fail">
			Raining now — do not tack on a wet surface.
		</div>
	{/if}

	<div class="apps">
		<span class="apps-label">Application</span>
		<div class="chips">
			{#each tack.field as t (t.id)}
				<button
					class="chip"
					class:active={job.tackApplication === t.id}
					onclick={() => (job.tackApplication = t.id)}
					title={getApplicationDescription(t.label)}
				>
					{t.label}
				</button>
			{/each}
		</div>
		<div class="rate-display">
			{selected.label}: <strong>{selected.min}–{selected.max} gal/SY</strong>
		</div>
		<p class="app-description">{getApplicationDescription(selected.label)}</p>
	</div>

	{#if job.widthFt}
		<div class="width-confirm">Using <strong>{job.widthFt} ft</strong> width</div>
	{:else}
		<div class="width-warn">Set road width in job settings to calculate tack gallons.</div>
	{/if}

	<ResultStat
		value={gallons != null && !tackBlocked ? Math.round(gallons.mid).toLocaleString() : null}
		unit="gal (suggested mid-rate)"
		secondary={gallons != null && !tackBlocked
			? `Range: ${Math.round(gallons.min)}–${Math.round(gallons.max)} gal`
			: tackBlocked
				? 'Blocked — dry surface required'
				: null}
		badge={tackBlocked ? { kind: 'bad', text: 'Wet surface — no tack' } : null}
	/>

	<ShowWork stepCount={3}>
		{#if lengthFt && job.widthFt && gallons != null}
			{@const areaYards = (lengthFt * job.widthFt) / 9}
			{@const midRate = tackMid(selected)}

			<CalculationStep
				step={1}
				label="Area in square yards"
				formula="{lengthFt.toFixed(0)} × {job.widthFt.toFixed(0)} ÷ 9"
				result="{areaYards.toFixed(2)} SY"
			/>
			<CalculationStep
				step={2}
				label="Mid rate"
				formula="({selected.min.toFixed(2)} + {selected.max.toFixed(2)}) ÷ 2"
				result="{midRate.toFixed(3)} gal/SY"
			/>
			<CalculationStep
				step={3}
				label="Gallons"
				formula="{areaYards.toFixed(2)} × {midRate.toFixed(3)}"
				result="{Math.round(gallons.mid)} gal"
			/>

			<CalcProofButton title="Tack Rate" getData={getProofData} />
		{:else}
			<code>gallons = (length × width ÷ 9) × shot rate (gal/SY)</code>
			<p>Enter length above to see step-by-step calculation.</p>
			<p>{selected.label}: {selected.min}–{selected.max} gal/SY.</p>
		{/if}

		<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
			<p>Width in use: <strong>{job.widthFt} ft</strong> (from job settings).</p>
			<div class="src-row">Tack range source: <SourceBadge status={selected.status} tier={selected.tier} /></div>
			<DotTable tableId="table-2" />
		</div>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	.apps {
		margin-bottom: var(--sp-4);
	}
	.apps-label {
		display: block;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-2);
	}
	.apps .chips {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.rate-display {
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		background: var(--surface-alt);
		border-radius: var(--radius-sm);
		font-size: var(--fs-md);
		color: var(--text-muted);
	}
	.rate-display strong {
		color: var(--accent);
		font-weight: var(--fw-bold);
	}
	.app-description {
		margin-top: var(--sp-3);
		font-size: var(--fs-sm);
		line-height: 1.4;
		color: var(--text-muted);
	}
	.width-note {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-3);
	}
	.width-note strong {
		color: var(--text);
	}
	.weather-warn {
		font-size: var(--fs-sm);
		padding: var(--sp-3);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-3);
		line-height: 1.35;
	}
	.weather-warn.warn {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.weather-warn.fail {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
		color: var(--bad);
		font-weight: 600;
	}
	.width-confirm {
		font-size: var(--fs-sm);
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface-alt);
		border-radius: var(--radius-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-3);
	}
	.width-confirm strong {
		color: var(--accent);
		font-weight: var(--fw-bold);
	}
	.width-warn {
		font-size: var(--fs-sm);
		padding: var(--sp-2) var(--sp-3);
		border-radius: var(--radius-sm);
		margin-bottom: var(--sp-3);
		background: color-mix(in srgb, var(--warn) 14%, transparent);
		color: var(--warn);
	}
	.label-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.tack-title {
		margin-bottom: var(--sp-4);
	}
	.tack-title-text {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
	}
</style>

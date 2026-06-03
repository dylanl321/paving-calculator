<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import DotTable from './DotTable.svelte';
	import CrossSectionDiagram from './CrossSectionDiagram.svelte';
	import Tooltip from './ui/Tooltip.svelte';
	import CalculationStep from './ui/CalculationStep.svelte';
	import CalcProofButton from './CalcProofButton.svelte';
	import type { CalcProofData } from '$lib/utils/pdf-export';
	import { constantMeta } from '$lib/config';
	import { stickCheck } from '$lib/config/formulas';
	import { logDraft } from '$lib/stores/logDraft.svelte';
	import { onDestroy } from 'svelte';

	// Stick check is self-contained: target compacted thickness in, loose out.
	let target = $state<number | null>(1.5);
	const factorMeta = constantMeta('CONST.STICK_FACTOR');

	function clearInputs() {
		target = 1.5;
		logDraft.clearFor('stick-check');
	}

	const loose = $derived(target && target > 0 ? stickCheck(target) : null);

	$effect(() => {
		if (loose != null && target) {
			logDraft.set({
				toolId: 'stick-check',
				entryType: 'note',
				summary: `Stick check: ${loose.toFixed(2)}" loose for ${target}" compacted`,
				fields: {
					notes: `Stick check: ${loose.toFixed(2)}" loose behind screed for ${target}" compacted`
				}
			});
		} else {
			logDraft.clearFor('stick-check');
		}
	});
	onDestroy(() => logDraft.clearFor('stick-check'));

	function getProofData(): CalcProofData | null {
		if (target == null || target <= 0 || loose == null) {
			return null;
		}

		return {
			title: 'Stick Check',
			inputs: {
				'Target compacted thickness': `${target.toFixed(2)}"`
			},
			steps: [
				{
					step: 1,
					label: 'Loose height',
					formula: `${target.toFixed(2)} × ${factorMeta.value}`,
					result: `${loose.toFixed(2)} in`
				}
			],
			result: {
				value: loose.toFixed(2),
				unit: 'inches loose behind screed'
			},
			notes: `Compaction factor of ${factorMeta.value} is the loose-to-compacted ratio from GDOT §400.3.05.C.`
		};
	}
</script>

<CalcCard
	title="Stick Check"
	hideTitle
	purpose="Loose material height to look for behind the screed for a target compacted thickness."
>
	<div class="label-with-tooltip">
		<NumberField label="Target compacted thickness" unit="in" step={0.25} bind:value={target} />
		<Tooltip term="Stick Check" definition="Manual thickness measurement of asphalt mat behind the screed. Measures loose material height to verify proper compacted thickness (loose height = compacted × 1.25)." />
	</div>

	<ResultStat
		value={loose != null ? Number(loose.toFixed(2)) : null}
		unit="in loose behind screed"
	/>

	{#if target != null && loose != null && target > 0}
		<CrossSectionDiagram compactedIn={target} looseIn={loose} />
	{/if}

	<ShowWork stepCount={1}>
		{#if target != null && target > 0 && loose != null}
			<CalculationStep
				step={1}
				label="Loose height"
				formula="{target.toFixed(2)} × {factorMeta.value}"
				result="{loose.toFixed(2)} in"
			/>

			<CalcProofButton title="Stick Check" getData={getProofData} />
		{:else}
			<code>loose = compacted × {factorMeta.value}</code>
			<p>Enter target compacted thickness above to see calculation.</p>
		{/if}

		<div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
			<div class="src-row">Compaction factor: <SourceBadge status={factorMeta.status} tier={factorMeta.tier} /></div>
			<p>Stick check uses GDOT §400.3.05.C (spreading & finishing). STICK_FACTOR 1.25 is the loose-to-compacted ratio applied to target depth to get the screed setting.</p>
			<DotTable tableId="table-4" />
		</div>
	</ShowWork>

	<button class="btn-clear" onclick={clearInputs}>Clear</button>
</CalcCard>

<style>
	/* Component uses global .btn-clear utility from app.css */
</style>

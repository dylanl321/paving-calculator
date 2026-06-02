<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import CrossSectionDiagram from './CrossSectionDiagram.svelte';
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
</script>

<CalcCard
	title="Stick Check"
	hideTitle
	purpose="Loose material height to look for behind the screed for a target compacted thickness."
>
	<NumberField label="Target compacted thickness" unit="in" step={0.25} bind:value={target} />

	<ResultStat
		value={loose != null ? Number(loose.toFixed(2)) : null}
		unit="in loose behind screed"
	/>

	{#if target != null && loose != null && target > 0}
		<CrossSectionDiagram compactedIn={target} looseIn={loose} />
	{/if}

	<ShowWork>
		<code>loose = compacted × {factorMeta.value}</code>
		<div class="src-row">Compaction factor: <SourceBadge status={factorMeta.status} tier={factorMeta.tier} /></div>
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
</style>

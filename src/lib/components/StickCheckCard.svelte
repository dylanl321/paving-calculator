<script lang="ts">
	import CalcCard from './CalcCard.svelte';
	import NumberField from './NumberField.svelte';
	import ResultStat from './ResultStat.svelte';
	import ShowWork from './ShowWork.svelte';
	import SourceBadge from './SourceBadge.svelte';
	import { constantMeta } from '$lib/config';
	import { stickCheck } from '$lib/config/formulas';

	// Stick check is self-contained: target compacted thickness in, loose out.
	let target = $state<number | null>(1.5);
	const factorMeta = constantMeta('CONST.STICK_FACTOR');

	const loose = $derived(target && target > 0 ? stickCheck(target) : null);
</script>

<CalcCard
	title="Stick Check"
	purpose="Loose material height to look for behind the screed for a target compacted thickness."
>
	<NumberField label="Target compacted thickness" unit="in" step={0.25} bind:value={target} />

	<ResultStat
		value={loose != null ? Number(loose.toFixed(2)) : null}
		unit="in loose behind screed"
	/>

	<ShowWork>
		<code>loose = compacted × {factorMeta.value}</code>
		<div class="src-row">Compaction factor: <SourceBadge status={factorMeta.status} tier={factorMeta.tier} /></div>
	</ShowWork>
</CalcCard>

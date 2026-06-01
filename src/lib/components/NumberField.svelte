<script lang="ts">
	interface Props {
		label: string;
		unit?: string;
		value: number | null;
		step?: number;
		hint?: string;
	}
	let { label, unit, value = $bindable(), step, hint }: Props = $props();
	const id = `f-${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="field">
	<label for={id}>{label}</label>
	<div class="with-unit">
		<input {id} type="number" inputmode="decimal" {step} bind:value />
		{#if unit}<span class="unit">{unit}</span>{/if}
	</div>
	{#if hint}<p class="field-hint">{hint}</p>{/if}
</div>

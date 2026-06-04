<script lang="ts">
	interface Props {
		label: string;
		unit?: string;
		value: number | null;
		step?: number;
		min?: number;
		max?: number;
		hint?: string;
		disabled?: boolean;
		error?: string;
	}
	let { label, unit, value = $bindable(), step, min, max, hint, disabled = false, error }: Props = $props();
	const id = `f-${Math.random().toString(36).slice(2, 8)}`;

	// Derived: is the current value out of the min/max range?
	const outOfRange = $derived(
		value !== null && (
			(min !== undefined && value < min) ||
			(max !== undefined && value > max)
		)
	);

	const isInvalid = $derived(!!error || outOfRange);
</script>

<div class="field" class:disabled>
	<label for={id}>{label}</label>
	<div class="with-unit">
		<input
			{id}
			type="number"
			inputmode="decimal"
			{step}
			{min}
			{max}
			{disabled}
			aria-invalid={isInvalid ? 'true' : undefined}
			bind:value
		/>
		{#if unit}<span class="unit">{unit}</span>{/if}
	</div>
	{#if error}<p class="field-error">{error}</p>{/if}
	{#if hint}<p class="field-hint">{hint}</p>{/if}
</div>

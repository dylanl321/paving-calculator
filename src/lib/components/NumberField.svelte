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
	let { label, unit, value = $bindable(), step = 1, min, max, hint, disabled = false, error }: Props = $props();
	const id = `f-${Math.random().toString(36).slice(2, 8)}`;

	// Derived: is the current value out of the min/max range?
	const outOfRange = $derived(
		value !== null && (
			(min !== undefined && value < min) ||
			(max !== undefined && value > max)
		)
	);

	const isInvalid = $derived(!!error || outOfRange);

	function handleFocus() {
		if (typeof navigator !== 'undefined' && navigator.vibrate) {
			navigator.vibrate(10);
		}
	}

	function decrement() {
		if (disabled) return;
		const current = value ?? 0;
		const next = current - step;
		if (min !== undefined && next < min) return;
		value = Math.round(next * 1e10) / 1e10;
	}

	function increment() {
		if (disabled) return;
		const current = value ?? 0;
		const next = current + step;
		if (max !== undefined && next > max) return;
		value = Math.round(next * 1e10) / 1e10;
	}

	const canDecrement = $derived(!disabled && (min === undefined || (value ?? 0) - step >= min));
	const canIncrement = $derived(!disabled && (max === undefined || (value ?? 0) + step <= max));
</script>

<div class="field" class:disabled>
	<label for={id}>{label}</label>
	<div class="with-unit">
		<button
			type="button"
			class="stepper stepper-dec"
			aria-label="Decrease {label}"
			disabled={!canDecrement}
			onclick={decrement}
		>−</button>
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
			onfocus={handleFocus}
		/>
		<button
			type="button"
			class="stepper stepper-inc"
			aria-label="Increase {label}"
			disabled={!canIncrement}
			onclick={increment}
		>+</button>
		{#if unit}<span class="unit">{unit}</span>{/if}
	</div>
	{#if error}<p class="field-error">{error}</p>{/if}
	{#if hint}<p class="field-hint">{hint}</p>{/if}
</div>

<style>
	.with-unit {
		display: flex;
		align-items: stretch;
		min-height: 48px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.stepper {
		flex-shrink: 0;
		width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface);
		border: none;
		color: var(--text);
		font-size: 1.5rem;
		font-weight: 400;
		line-height: 1;
		cursor: pointer;
		touch-action: manipulation;
		transition: background var(--dur-fast, 150ms) ease;
		/* Ensure tap highlight on mobile */
		-webkit-tap-highlight-color: transparent;
	}

	.stepper:disabled {
		color: var(--text-muted);
		cursor: default;
		opacity: 0.4;
	}

	.stepper:not(:disabled):active {
		background: var(--surface-hover, rgba(255 255 255 / 0.08));
	}

	.stepper-dec {
		border-right: 1px solid var(--border);
	}

	.stepper-inc {
		border-left: 1px solid var(--border);
	}

	input[type='number'] {
		flex: 1;
		min-width: 0;
		min-height: 48px;
		/* 1rem = 16px minimum to prevent iOS auto-zoom on focus */
		font-size: max(1rem, 1.4rem);
		font-weight: 600;
		text-align: center;
		padding: 0 var(--sp-2, 8px);
		border: none;
		background: transparent;
		color: var(--text);
		/* Hide native browser spinners — we provide our own */
		-moz-appearance: textfield;
	}

	input[type='number']::-webkit-inner-spin-button,
	input[type='number']::-webkit-outer-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	input[type='number']:focus {
		outline: none;
	}

	/* Focus ring on the container instead */
	.with-unit:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 0;
	}

	.unit {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		padding: 0 var(--sp-3, 12px);
		color: var(--text-muted);
		font-size: var(--fs-md);
		white-space: nowrap;
		border-left: 1px solid var(--border);
	}

	.disabled .stepper,
	.disabled input[type='number'] {
		opacity: 0.5;
		cursor: default;
	}
</style>

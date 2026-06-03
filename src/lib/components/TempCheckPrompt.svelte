<script lang="ts">
	import { onMount } from 'svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { temperature } from '$lib/config';

	const STORAGE_KEY = 'paverate.temp-check.last-date';

	let showPrompt = $state(false);
	let inputTemp = $state<number | null>(null);

	function todayDate(): string {
		return new Date().toISOString().split('T')[0];
	}

	function isDoneForToday(): boolean {
		if (typeof localStorage === 'undefined') return true;
		return localStorage.getItem(STORAGE_KEY) === todayDate();
	}

	function markDoneForToday() {
		if (typeof localStorage === 'undefined') return;
		localStorage.setItem(STORAGE_KEY, todayDate());
	}

	/** Find the thickest lift that can be paved at a given temperature. */
	function maxLiftAtTemp(tempF: number): number | null {
		const sorted = [...temperature].sort((a, b) => b.maxThicknessIn - a.maxThicknessIn);
		const entry = sorted.find((t) => tempF >= t.minAirTempF);
		return entry ? entry.maxThicknessIn : null;
	}

	/** Minimum temp in the table for any paving. */
	const absoluteMinTempF = $derived.by(() => {
		if (!temperature.length) return 32;
		return Math.min(...temperature.map((t) => t.minAirTempF));
	});

	const pavingHint = $derived.by(() => {
		if (inputTemp == null) return null;
		const temp: number = inputTemp;
		const maxLift = maxLiftAtTemp(temp);
		if (maxLift == null) {
			return {
				status: 'bad' as const,
				text: `${temp}°F is below the minimum for any HMA placement (${absoluteMinTempF}°F)`
			};
		}
		// Check if it is within warn margin (5°F) of the limit
		const warnEntries = temperature.filter(
			(t) => temp >= t.minAirTempF && temp < t.minAirTempF + 5
		);
		if (warnEntries.length > 0) {
			return {
				status: 'warn' as const,
				text: `Borderline — at ${temp}°F you can pave up to ${maxLift}" lifts (GDOT Table 4)`
			};
		}
		return {
			status: 'good' as const,
			text: `At ${temp}°F you can pave lifts up to ${maxLift}" (GDOT Table 4)`
		};
	});

	function useTemp() {
		if (inputTemp != null) {
			weather.manualTempF = inputTemp;
			weather.useManualTemp = true;
		}
		markDoneForToday();
		showPrompt = false;
	}

	function skip() {
		markDoneForToday();
		showPrompt = false;
	}

	function increment() {
		inputTemp = (inputTemp ?? 50) + 1;
	}

	function decrement() {
		inputTemp = (inputTemp ?? 50) - 1;
	}

	onMount(() => {
		if (isDoneForToday()) return;

		// Small delay so the page finishes loading before the prompt appears
		const timer = setTimeout(() => {
			// Pre-fill with the best available temperature
			const preTemp = weather.effectiveTempF ?? weather.airTempF;
			inputTemp = preTemp != null ? Math.round(preTemp) : null;
			showPrompt = true;
		}, 800);

		return () => clearTimeout(timer);
	});
</script>

{#if showPrompt}
	<div class="temp-check-backdrop" onclick={skip} role="presentation"></div>
	<div class="temp-check-sheet" role="dialog" aria-modal="true" aria-labelledby="temp-check-title">
		<div class="temp-check-header">
			<span class="temp-check-icon">🌡️</span>
			<div>
				<h2 class="temp-check-title" id="temp-check-title">Good morning — temp check</h2>
				<p class="temp-check-sub">Confirm today's air temperature for paving decisions</p>
			</div>
		</div>

		{#if weather.airTempF != null && !weather.useManualTemp}
			<p class="temp-check-weather-hint">
				Weather: <strong>{weather.airTempF}°F</strong>
				{#if weather.conditions}— {weather.conditions}{/if}
			</p>
		{/if}

		<div class="temp-check-input-row">
			<button class="temp-adj-btn" onclick={decrement} aria-label="Decrease temperature">−</button>
			<div class="temp-input-wrap">
				<input
					class="temp-input"
					type="number"
					inputmode="numeric"
					min="-20"
					max="130"
					placeholder="--"
					bind:value={inputTemp}
					aria-label="Air temperature in Fahrenheit"
				/>
				<span class="temp-unit">°F</span>
			</div>
			<button class="temp-adj-btn" onclick={increment} aria-label="Increase temperature">+</button>
		</div>

		{#if pavingHint != null}
			<div class="temp-hint temp-hint-{pavingHint.status}">
				{#if pavingHint.status === 'good'}✓{:else if pavingHint.status === 'warn'}⚠{:else}✕{/if}
				{pavingHint.text}
			</div>
		{:else}
			<div class="temp-hint-empty">Enter the current air temperature at the job site</div>
		{/if}

		<div class="temp-check-actions">
			<button class="btn btn-primary temp-use-btn" onclick={useTemp} disabled={inputTemp == null}>
				Use this temp
			</button>
			<button class="btn btn-subtle temp-skip-btn" onclick={skip}>Skip</button>
		</div>
	</div>
{/if}

<style>
	.temp-check-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
		z-index: 8900;
		animation: fadeIn 0.2s var(--ease, ease);
	}

	.temp-check-sheet {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		background: var(--surface);
		border-top: 1px solid var(--border);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		padding: var(--sp-6);
		padding-bottom: calc(var(--sp-6) + env(safe-area-inset-bottom));
		z-index: 8901;
		box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.3);
		animation: slideUp 0.3s var(--ease, ease);
		max-width: 480px;
		margin: 0 auto;
	}

	.temp-check-header {
		display: flex;
		align-items: flex-start;
		gap: var(--sp-3);
		margin-bottom: var(--sp-4);
	}

	.temp-check-icon {
		font-size: 1.75rem;
		line-height: 1;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.temp-check-title {
		margin: 0;
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold, 700);
		color: var(--text);
		line-height: 1.2;
	}

	.temp-check-sub {
		margin: var(--sp-1) 0 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
	}

	.temp-check-weather-hint {
		margin: 0 0 var(--sp-4);
		font-size: var(--fs-sm);
		color: var(--text-muted);
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
	}

	.temp-check-weather-hint strong {
		color: var(--text);
	}

	.temp-check-input-row {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-4);
		margin-bottom: var(--sp-4);
	}

	.temp-adj-btn {
		width: 48px;
		height: 48px;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--surface-alt);
		color: var(--text);
		font-size: 1.5rem;
		font-weight: 400;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.15s;
		touch-action: manipulation;
	}

	.temp-adj-btn:active {
		background: var(--surface-hover);
	}

	.temp-input-wrap {
		display: flex;
		align-items: center;
		gap: var(--sp-1);
	}

	.temp-input {
		width: 90px;
		height: 64px;
		font-size: 2.5rem;
		font-weight: 700;
		text-align: center;
		background: transparent;
		border: none;
		border-bottom: 2px solid var(--accent);
		color: var(--text);
		outline: none;
		-moz-appearance: textfield;
	}

	.temp-input::-webkit-outer-spin-button,
	.temp-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.temp-unit {
		font-size: var(--fs-xl);
		color: var(--text-muted);
		font-weight: 600;
	}

	.temp-hint,
	.temp-hint-empty {
		margin-bottom: var(--sp-5);
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-md);
		font-size: var(--fs-sm);
		line-height: 1.4;
	}

	.temp-hint-empty {
		color: var(--text-muted);
		background: var(--surface-alt);
		border: 1px solid var(--border);
	}

	.temp-hint-good {
		background: color-mix(in srgb, var(--good) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--good) 35%, transparent);
		color: var(--good);
	}

	.temp-hint-warn {
		background: color-mix(in srgb, var(--warn) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent);
		color: var(--warn);
	}

	.temp-hint-bad {
		background: color-mix(in srgb, var(--bad) 12%, transparent);
		border: 1px solid color-mix(in srgb, var(--bad) 35%, transparent);
		color: var(--bad);
	}

	.temp-check-actions {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.temp-use-btn {
		width: 100%;
	}

	.temp-skip-btn {
		width: 100%;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes slideUp {
		from { transform: translateY(100%); }
		to { transform: translateY(0); }
	}
</style>

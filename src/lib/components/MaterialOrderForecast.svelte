<script lang="ts">
	import { ShoppingCart } from 'lucide-svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { toMetricTonnes, UNIT_LABELS } from '$lib/utils/unitConvert';

	interface Props {
		remainingTons?: number | null;
		avgTonsPerLoad?: number;
		tonsPerHour?: number;
		targetTonnage?: number | null;
		totalTons?: number;
	}

	let {
		remainingTons = null,
		avgTonsPerLoad = 0,
		tonsPerHour = 0,
		targetTonnage = null,
		totalTons = 0
	}: Props = $props();

	// Only show when there is remaining work
	const shouldShow = $derived(remainingTons != null && remainingTons > 0);

	// Computed values
	const loadsNeeded = $derived.by(() => {
		if (!shouldShow || avgTonsPerLoad <= 0) return null;
		return Math.ceil(remainingTons! / avgTonsPerLoad);
	});

	const hoursToComplete = $derived.by(() => {
		if (!shouldShow || tonsPerHour <= 0) return null;
		return remainingTons! / tonsPerHour;
	});

	const projectedFinishTime = $derived.by(() => {
		if (hoursToComplete == null) return null;
		const hours = Math.floor(hoursToComplete);
		const minutes = Math.round((hoursToComplete - hours) * 60);
		if (hours === 0) return `${minutes}m`;
		return `${hours}h ${minutes}m`;
	});

	const orderBuffer = $derived.by(() => {
		if (!shouldShow) return null;
		return Math.ceil((remainingTons! * 1.05) * 10) / 10;
	});

	// Display values with unit conversion
	const displayRemainingTons = $derived.by(() => {
		if (remainingTons == null) return 0;
		return unitsStore.system === 'metric' ? toMetricTonnes(remainingTons) : remainingTons;
	});

	const displayOrderBuffer = $derived.by(() => {
		if (orderBuffer == null) return 0;
		return unitsStore.system === 'metric' ? toMetricTonnes(orderBuffer) : orderBuffer;
	});

	const shouldShowAlert = $derived.by(() => {
		if (!shouldShow) return false;
		const needsLoads = loadsNeeded != null && loadsNeeded > 5;
		const needsHours = hoursToComplete != null && hoursToComplete > 4;
		return needsLoads || needsHours;
	});
</script>

{#if shouldShow}
	<div class="material-forecast">
		<div class="forecast-header">
			<ShoppingCart size={20} />
			<h4>Material Forecast</h4>
		</div>

		<div class="forecast-stats">
			<div class="stat-tile">
				<div class="stat-label">Remaining</div>
				<div class="stat-value">{displayRemainingTons.toFixed(1)}</div>
				<div class="stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
			</div>

			<div class="stat-tile">
				<div class="stat-label">Loads Needed</div>
				<div class="stat-value">{loadsNeeded ?? '—'}</div>
			</div>

			<div class="stat-tile">
				<div class="stat-label">Order Qty</div>
				<div class="stat-value">{displayOrderBuffer.toFixed(1)}</div>
				<div class="stat-sub">(+5% buffer)</div>
			</div>

			<div class="stat-tile">
				<div class="stat-label">At Current Rate</div>
				<div class="stat-value">{projectedFinishTime ?? '—'}</div>
			</div>
		</div>

		{#if shouldShowAlert}
			<div class="forecast-alert">
				Order asap — {loadsNeeded ?? 0} loads needed to complete the job
			</div>
		{/if}
	</div>
{/if}

<style>
	.material-forecast {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-top: var(--sp-4);
	}

	.forecast-header {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: var(--sp-2);
	}

	.forecast-header h4 {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.forecast-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
		gap: var(--sp-3);
		margin-top: var(--sp-3);
	}

	.stat-tile {
		text-align: center;
	}

	.stat-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-1);
	}

	.stat-value {
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		color: var(--text);
		line-height: 1.2;
	}

	.stat-unit {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.stat-sub {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.forecast-alert {
		margin-top: var(--sp-3);
		padding: var(--sp-3);
		background: color-mix(in srgb, #f59e0b 12%, transparent);
		border: 1px solid color-mix(in srgb, #f59e0b 35%, transparent);
		border-radius: var(--radius-sm);
		color: #f59e0b;
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
		text-align: center;
	}
</style>

<script lang="ts">
	import { Clock } from 'lucide-svelte';
	import { unitsStore } from '$lib/stores/units.svelte';
	import { toMetricTonnes, UNIT_LABELS } from '$lib/utils/unitConvert';

	interface Props {
		tonsDeliveredToday: number;
		targetTonnage: number | null;
		tonsPerHour: number;
		avgTonsPerLoad: number;
		workdayEndHour?: number;
	}

	let {
		tonsDeliveredToday,
		targetTonnage,
		tonsPerHour,
		avgTonsPerLoad,
		workdayEndHour = 17
	}: Props = $props();

	// Time-aware visibility and phase calculation
	const currentTime = $derived(new Date());
	const currentHour = $derived(currentTime.getHours() + currentTime.getMinutes() / 60);

	const phase = $derived.by(() => {
		if (currentHour < 14.5) return 'hidden';
		if (currentHour >= 14.5 && currentHour < 15) return 'preparing';
		if (currentHour >= 15 && currentHour < 16) return 'active';
		if (currentHour >= 16 && currentHour <= 17.5) return 'closed';
		return 'hidden';
	});

	const shouldShow = $derived(phase !== 'hidden');

	// Core calculations
	const tonsRemainingForJob = $derived(
		targetTonnage && targetTonnage > 0 ? Math.max(0, targetTonnage - tonsDeliveredToday) : 0
	);

	const hoursRemainingInDay = $derived(Math.max(0, workdayEndHour - currentHour));

	const tonsExpectedByEOD = $derived(tonsDeliveredToday + tonsPerHour * hoursRemainingInDay);

	const tonsShortfall = $derived(
		targetTonnage && targetTonnage > 0 ? Math.max(0, targetTonnage - tonsExpectedByEOD) : 0
	);

	const recommendedOrder = $derived(Math.ceil(tonsShortfall * 1.05));

	const loadsToOrder = $derived(
		avgTonsPerLoad > 0 ? Math.ceil(recommendedOrder / avgTonsPerLoad) : 0
	);

	const onTrack = $derived(tonsShortfall <= 0);

	// Display values with unit conversion
	const displayRecommendedOrder = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(recommendedOrder) : recommendedOrder
	);
	const displayTonsRemaining = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(tonsRemainingForJob) : tonsRemainingForJob
	);
	const displayTonsExpectedByEOD = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(tonsExpectedByEOD) : tonsExpectedByEOD
	);
	const displayTonsShortfall = $derived(
		unitsStore.system === 'metric' ? toMetricTonnes(tonsShortfall) : tonsShortfall
	);

	const phaseBadgeText = $derived.by(() => {
		if (phase === 'preparing') return 'Preparing';
		if (phase === 'active') return 'Active';
		if (phase === 'closed') return 'Closed';
		return '';
	});

	const phaseMessage = $derived.by(() => {
		if (phase === 'preparing') return 'Preparing for afternoon order window';
		if (phase === 'active') return 'Order window open - place orders now';
		if (phase === 'closed') return 'Order window closed - final status';
		return '';
	});

	const hasTarget = $derived(targetTonnage != null && targetTonnage > 0);
</script>

{#if shouldShow}
	<div class="afternoon-forecast" class:afternoon-forecast--active={phase === 'active'}>
		<div class="forecast-header">
			<div class="header-left">
				<Clock size={20} />
				<h4>Plant Order Forecast</h4>
			</div>
			<div class="phase-badge phase-badge--{phase}">{phaseBadgeText}</div>
		</div>

		<div class="phase-message">{phaseMessage}</div>

		{#if !hasTarget}
			<div class="no-target-message">Set a target tonnage to see forecast</div>
		{:else}
			<div class="main-stat">
				<div class="main-stat-label">Recommended Order</div>
				<div class="main-stat-value" class:main-stat-value--on-track={onTrack}>
					{displayRecommendedOrder.toFixed(1)}
				</div>
				<div class="main-stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				{#if onTrack}
					<div class="status-badge status-badge--on-track">On Track</div>
				{:else if phase === 'active'}
					<div class="status-badge status-badge--order-now">Order Now</div>
				{/if}
			</div>

			<div class="sub-stats-grid">
				<div class="sub-stat">
					<div class="sub-stat-label">Remaining for Job</div>
					<div class="sub-stat-value">{displayTonsRemaining.toFixed(1)}</div>
					<div class="sub-stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				</div>

				<div class="sub-stat">
					<div class="sub-stat-label">Expected by EOD</div>
					<div class="sub-stat-value">{displayTonsExpectedByEOD.toFixed(1)}</div>
					<div class="sub-stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				</div>

				<div class="sub-stat">
					<div class="sub-stat-label">Shortfall</div>
					<div class="sub-stat-value">{displayTonsShortfall.toFixed(1)}</div>
					<div class="sub-stat-unit">{UNIT_LABELS.tons[unitsStore.system]}</div>
				</div>

				<div class="sub-stat">
					<div class="sub-stat-label">Loads to Order</div>
					<div class="sub-stat-value">{loadsToOrder}</div>
					<div class="sub-stat-unit">loads</div>
				</div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.afternoon-forecast {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
		margin-top: var(--sp-4);
	}

	.afternoon-forecast--active {
		background: color-mix(in srgb, #f59e0b 8%, var(--surface-alt));
		border-color: #f59e0b;
		box-shadow: 0 0 20px color-mix(in srgb, #f59e0b 25%, transparent);
	}

	.forecast-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--sp-3);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
	}

	.forecast-header h4 {
		margin: 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.phase-badge {
		padding: 4px 10px;
		border-radius: 9999px;
		font-size: var(--fs-xs);
		font-weight: var(--fw-semibold);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.phase-badge--preparing {
		background: color-mix(in srgb, var(--text-muted) 15%, transparent);
		color: var(--text-muted);
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
	}

	.phase-badge--active {
		background: color-mix(in srgb, #f59e0b 20%, transparent);
		color: #f59e0b;
		border: 1px solid #f59e0b;
	}

	.phase-badge--closed {
		background: color-mix(in srgb, var(--text-muted) 15%, transparent);
		color: var(--text-muted);
		border: 1px solid color-mix(in srgb, var(--text-muted) 30%, transparent);
	}

	.phase-message {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-4);
	}

	.no-target-message {
		padding: var(--sp-4);
		text-align: center;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-style: italic;
	}

	.main-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--sp-4) 0;
		border-bottom: 1px solid var(--border);
	}

	.main-stat-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		margin-bottom: var(--sp-2);
	}

	.main-stat-value {
		font-size: var(--fs-3xl);
		font-weight: var(--fw-bold);
		color: #f59e0b;
		line-height: 1;
	}

	.main-stat-value--on-track {
		color: #22c55e;
	}

	.main-stat-unit {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-top: var(--sp-1);
	}

	.status-badge {
		margin-top: var(--sp-3);
		padding: 6px 16px;
		border-radius: 9999px;
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.status-badge--on-track {
		background: color-mix(in srgb, #22c55e 20%, transparent);
		color: #22c55e;
		border: 1px solid #22c55e;
	}

	.status-badge--order-now {
		background: color-mix(in srgb, #f59e0b 20%, transparent);
		color: #f59e0b;
		border: 1px solid #f59e0b;
	}

	.sub-stats-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-4);
		margin-top: var(--sp-4);
	}

	.sub-stat {
		text-align: center;
	}

	.sub-stat-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-bottom: var(--sp-1);
	}

	.sub-stat-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text);
		line-height: 1.2;
	}

	.sub-stat-unit {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: 2px;
	}

	@media (max-width: 460px) {
		.sub-stats-grid {
			grid-template-columns: 1fr;
			gap: var(--sp-3);
		}
	}
</style>

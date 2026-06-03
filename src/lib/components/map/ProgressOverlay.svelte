<script lang="ts">
	interface Props {
		totalFt: number | null;
		pavedFt: number;
		activeTodayFt: number;
		daysWithData: number;
		collapsed?: boolean;
	}

	let {
		totalFt,
		pavedFt,
		activeTodayFt,
		daysWithData,
		collapsed = $bindable(false)
	}: Props = $props();

	const totalMiles = $derived(totalFt != null ? totalFt / 5280 : null);
	const pavedMiles = $derived(pavedFt / 5280);
	const remainingFt = $derived(totalFt != null ? Math.max(0, totalFt - pavedFt) : null);
	const pctPaved = $derived(
		totalFt != null && totalFt > 0 ? Math.min(100, Math.round((pavedFt / totalFt) * 100)) : null
	);
	const pctToday = $derived(
		totalFt != null && totalFt > 0
			? Math.min(100 - (pctPaved ?? 0), Math.round((activeTodayFt / totalFt) * 100))
			: null
	);

	// ETA: if we have days of data and progress, estimate days remaining
	const etaDays = $derived.by(() => {
		if (daysWithData <= 0 || pavedFt <= 0 || remainingFt == null || remainingFt <= 0) return null;
		const ftPerDay = pavedFt / daysWithData;
		if (ftPerDay <= 0) return null;
		return Math.ceil(remainingFt / ftPerDay);
	});
</script>

<div class="progress-overlay" class:collapsed>
	<button
		class="overlay-toggle"
		onclick={() => (collapsed = !collapsed)}
		aria-label={collapsed ? 'Expand progress summary' : 'Collapse progress summary'}
	>
		<span class="overlay-title">Progress</span>
		<svg
			class="chevron"
			class:rotated={!collapsed}
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<polyline points="6 9 12 15 18 9"></polyline>
		</svg>
	</button>

	{#if !collapsed}
		<div class="overlay-body">
			<!-- Progress bar -->
			<div class="prog-bar" role="progressbar" aria-valuenow={pctPaved ?? 0} aria-valuemin={0} aria-valuemax={100}>
				{#if pctPaved != null && pctPaved > 0}
					<div class="prog-seg prog-green" style="width:{pctPaved}%"></div>
				{/if}
				{#if pctToday != null && pctToday > 0}
					<div class="prog-seg prog-yellow" style="width:{pctToday}%"></div>
				{/if}
			</div>

			<div class="overlay-stats">
				{#if totalMiles != null}
					<div class="ov-stat">
						<span class="ov-label">Total</span>
						<span class="ov-value">{totalMiles.toFixed(2)} mi</span>
					</div>
				{/if}
				<div class="ov-stat">
					<span class="ov-label">Paved</span>
					<span class="ov-value ov-green">
						{pavedMiles.toFixed(2)} mi{pctPaved != null ? ` (${pctPaved}%)` : ''}
					</span>
				</div>
				{#if remainingFt != null}
					<div class="ov-stat">
						<span class="ov-label">Remaining</span>
						<span class="ov-value ov-muted">{(remainingFt / 5280).toFixed(2)} mi</span>
					</div>
				{/if}
				{#if etaDays != null}
					<div class="ov-stat">
						<span class="ov-label">ETA</span>
						<span class="ov-value">~{etaDays} day{etaDays !== 1 ? 's' : ''}</span>
					</div>
				{/if}
			</div>

			<!-- Legend -->
			<div class="overlay-legend">
				<span class="leg-dot leg-green"></span><span class="leg-text">Paved</span>
				<span class="leg-dot leg-yellow"></span><span class="leg-text">Today</span>
				<span class="leg-dot leg-grey"></span><span class="leg-text">Remaining</span>
			</div>
		</div>
	{/if}
</div>

<style>
	.progress-overlay {
		position: absolute;
		bottom: 24px;
		left: 12px;
		z-index: 500;
		background: rgba(15, 23, 42, 0.88);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		min-width: 170px;
		max-width: 210px;
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		overflow: hidden;
		pointer-events: all;
	}

	.overlay-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 10px 12px;
		background: transparent;
		border: none;
		cursor: pointer;
		color: #f1f5f9;
		min-height: 48px;
		gap: 6px;
	}

	.overlay-toggle:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.overlay-title {
		font-size: 0.8rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: #94a3b8;
	}

	.chevron {
		color: #94a3b8;
		transition: transform 0.2s;
		flex-shrink: 0;
	}

	.chevron.rotated {
		transform: rotate(180deg);
	}

	.overlay-body {
		padding: 0 12px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.prog-bar {
		height: 6px;
		background: #374151;
		border-radius: 3px;
		overflow: hidden;
		display: flex;
	}

	.prog-seg {
		height: 100%;
	}

	.prog-green {
		background: #22c55e;
	}

	.prog-yellow {
		background: #f2c037;
	}

	.overlay-stats {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.ov-stat {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}

	.ov-label {
		font-size: 0.7rem;
		color: #94a3b8;
		white-space: nowrap;
	}

	.ov-value {
		font-size: 0.78rem;
		font-weight: 700;
		color: #f1f5f9;
		text-align: right;
	}

	.ov-green {
		color: #22c55e;
	}

	.ov-muted {
		color: #94a3b8;
	}

	.overlay-legend {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
		margin-top: 2px;
	}

	.leg-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.leg-green {
		background: #22c55e;
	}

	.leg-yellow {
		background: #f2c037;
	}

	.leg-grey {
		background: #6b7280;
	}

	.leg-text {
		font-size: 0.65rem;
		color: #94a3b8;
		margin-right: 4px;
	}
</style>

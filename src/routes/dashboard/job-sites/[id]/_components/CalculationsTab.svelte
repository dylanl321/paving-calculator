<script lang="ts">
	import { formatDate } from './shared';
	import type { Calculation } from '../$types';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import SourceBadge from '$lib/components/SourceBadge.svelte';

	let {
		calculations,
		onNewCalculation
	}: {
		calculations: Calculation[];
		onNewCalculation: () => void;
	} = $props();

	function formatCalcType(type: string): string {
		const labels: Record<string, string> = {
			spread_rate: 'Spread Rate',
			feet_left: 'Feet Left',
			tonnage: 'Tonnage',
			tack_rate: 'Tack Rate',
			stick_check: 'Stick Check'
		};
		return labels[type] || type;
	}

	function getResultSummary(calc: any): string {
		switch (calc.calc_type) {
			case 'spread_rate':
				return `${calc.result.lbsPerSqYd?.toFixed(1) || '—'} lbs/yd²`;
			case 'feet_left':
				return `${calc.result.feetRemaining?.toFixed(0) || '—'} ft remaining`;
			case 'tonnage':
				return `${calc.result.tonsRequired?.toFixed(1) || '—'} tons`;
			case 'tack_rate':
				return `${calc.result.gallonsPerSqYd?.toFixed(3) || '—'} gal/yd²`;
			case 'stick_check':
				return `${calc.result.stickReading?.toFixed(2) || '—'} in`;
			default:
				return '—';
		}
	}
</script>

<section class="section">
	<div class="section-header">
		<h3>Saved Calculations</h3>
		<button class="btn-primary" onclick={onNewCalculation}>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="12" y1="5" x2="12" y2="19"></line>
				<line x1="5" y1="12" x2="19" y2="12"></line>
			</svg>
			New Calculation
		</button>
	</div>
	<p class="section-intro">
		The project's living numbers — area, tonnage, spread, and cost — are calculated
		automatically on the Overview tab. Use these calculators for one-off and what-if checks.
	</p>

	<div class="context-banner">
		<div class="context-header">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<circle cx="12" cy="12" r="10"></circle>
				<line x1="12" y1="16" x2="12" y2="12"></line>
				<line x1="12" y1="8" x2="12.01" y2="8"></line>
			</svg>
			<span>Calculator Context</span>
		</div>
		<div class="context-values">
			<div class="context-item">
				<span class="context-label">Road Width:</span>
				<span class="context-value">{calcContext.road_width.value} ft</span>
				<SourceBadge
					source={calcContext.road_width.source}
					updatedAt={calcContext.road_width.updatedAt}
					label="Road Width"
				/>
			</div>
			<div class="context-item">
				<span class="context-label">Lift Thickness:</span>
				<span class="context-value">{calcContext.lift_thickness.value} in</span>
				<SourceBadge
					source={calcContext.lift_thickness.source}
					updatedAt={calcContext.lift_thickness.updatedAt}
					label="Lift Thickness"
				/>
			</div>
			<div class="context-item">
				<span class="context-label">Course Type:</span>
				<span class="context-value">{calcContext.course_type.value}</span>
				<SourceBadge
					source={calcContext.course_type.source}
					updatedAt={calcContext.course_type.updatedAt}
					label="Course Type"
				/>
			</div>
		</div>
	</div>

	{#if calculations.length === 0}
		<div class="empty-state">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path
					d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
				></path>
			</svg>
			<h4>No calculations yet</h4>
			<p>This project's core numbers are already calculated on the Overview. Run a calculator here for a quick one-off or what-if check.</p>
			<button class="btn-primary" style="margin-top: 16px;" onclick={onNewCalculation}>
				Open Calculator
			</button>
		</div>
	{:else}
		<div class="calc-list">
			{#each calculations as calc}
				<div class="calc-card">
					<div class="calc-header">
						<div class="calc-type-icon">
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							>
								<path
									d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
								></path>
							</svg>
						</div>
						<div class="calc-info">
							<h4 class="calc-type">{formatCalcType(calc.calc_type)}</h4>
							<p class="calc-date">{formatDate(calc.created_at)}</p>
						</div>
						<div class="calc-result">
							{getResultSummary(calc)}
						</div>
					</div>
					{#if calc.notes}
						<div class="calc-notes">{calc.notes}</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</section>

<style>
	.context-banner {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
		margin-bottom: 20px;
	}

	.context-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.context-header svg {
		color: var(--accent);
	}

	.context-values {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.context-item {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
	}

	.context-label {
		color: var(--text-muted);
		min-width: 120px;
	}

	.context-value {
		font-weight: 600;
		color: var(--text);
		min-width: 80px;
	}

	@media (min-width: 640px) {
		.context-values {
			flex-direction: row;
			justify-content: space-between;
		}

		.context-item {
			flex: 1;
		}
	}

	.calc-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.calc-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 16px;
	}

	.calc-header {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.calc-type-icon {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--surface-alt);
		border-radius: 10px;
		color: var(--accent);
	}

	.calc-info {
		flex: 1;
		min-width: 0;
	}

	.calc-type {
		margin: 0 0 2px;
		font-size: 1rem;
	}

	.calc-date {
		margin: 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.calc-result {
		font-size: 1.1rem;
		font-weight: 700;
		color: var(--accent);
		text-align: right;
	}

	.calc-notes {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--border);
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
</style>

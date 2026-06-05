<script lang="ts">
	import { formatFeet } from '$lib/utils/format';

	interface Props {
		totalTons: number;
		totalLf: number;
		entryCount: number;
		targetTons?: number | null;
	}

	let { totalTons, totalLf, entryCount, targetTons = null }: Props = $props();

	const pct = $derived(
		targetTons && targetTons > 0 ? Math.min(100, (totalTons / targetTons) * 100) : null
	);

	const barColor = $derived(() => {
		if (pct === null) return 'var(--accent)';
		if (pct >= 100) return 'var(--good)';
		if (pct >= 75) return 'var(--accent)';
		return 'var(--warn, #F59E0B)';
	});
</script>

{#if entryCount > 0 || totalTons > 0}
	<div class="running-total-banner" aria-label="Today's running totals">
		<div class="banner-stats">
			<div class="stat">
				<span class="stat-value">{totalTons.toFixed(1)}</span>
				<span class="stat-label">
					tons placed
					{#if targetTons && targetTons > 0}
						/ {targetTons} target
					{/if}
				</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{formatFeet(totalLf)}</span>
				<span class="stat-label">LF paved</span>
			</div>
			<div class="stat-divider"></div>
			<div class="stat">
				<span class="stat-value">{entryCount}</span>
				<span class="stat-label">{entryCount === 1 ? 'entry' : 'entries'} today</span>
			</div>
			{#if pct !== null}
				<div class="stat-divider"></div>
				<div class="stat stat-pct">
					<span class="stat-value" style="color: {barColor()}">{Math.round(pct)}%</span>
					<span class="stat-label">of target</span>
				</div>
			{/if}
		</div>
		{#if pct !== null}
			<div class="banner-progress">
				<div
					class="banner-progress-fill"
					style="width: {pct}%; background-color: {barColor()};"
				></div>
			</div>
		{/if}
	</div>
{/if}

<style>
	.running-total-banner {
		position: sticky;
		top: 0;
		z-index: 40;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
		margin-bottom: var(--sp-3);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
	}

	.banner-stats {
		display: flex;
		align-items: center;
		gap: 0;
		padding: var(--sp-2) var(--sp-4);
		flex-wrap: wrap;
	}

	.stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: var(--sp-2) var(--sp-3);
		min-width: 0;
		flex: 1;
	}

	.stat-pct {
		min-width: 60px;
	}

	.stat-value {
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
		color: var(--text-1);
		white-space: nowrap;
		line-height: 1.2;
	}

	.stat-label {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-align: center;
		white-space: nowrap;
		margin-top: 2px;
	}

	.stat-divider {
		width: 1px;
		height: 36px;
		background: var(--border);
		flex-shrink: 0;
	}

	.banner-progress {
		height: 4px;
		background: var(--surface);
	}

	.banner-progress-fill {
		height: 100%;
		transition: width 0.4s ease, background-color 0.4s ease;
	}

	@media (max-width: 480px) {
		.banner-stats {
			padding: var(--sp-1) var(--sp-2);
			gap: 0;
		}

		.stat {
			padding: var(--sp-1) var(--sp-2);
		}

		.stat-value {
			font-size: var(--fs-base);
		}
	}
</style>

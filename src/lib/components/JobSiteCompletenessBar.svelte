<script lang="ts">
	interface Props {
		/** 0-100 score from /api/org/completeness, or null while loading */
		score: number | null;
		/** 'complete' | 'needs-attention' | 'incomplete' | null */
		status: string | null;
		/** Compact mode — single row, no label text (default: false) */
		compact?: boolean;
	}

	let { score, status, compact = false }: Props = $props();

	const pct = $derived(score ?? 0);

	const color = $derived(() => {
		if (status === 'complete') return 'var(--good, #22c55e)';
		if (status === 'needs-attention') return '#f59e0b';
		if (status === 'incomplete') return '#ef4444';
		// Fallback: derive from raw score
		if (pct >= 90) return 'var(--good, #22c55e)';
		if (pct >= 60) return '#f59e0b';
		return '#ef4444';
	});

	const label = $derived(() => {
		if (status === 'complete') return 'Complete';
		if (status === 'needs-attention') return 'Needs attention';
		return 'Incomplete';
	});
</script>

{#if score != null}
	<div class="completeness-bar" class:compact>
		<div class="bar-row">
			<div class="track">
				<div
					class="fill"
					style="width: {pct}%; background: {color()};"
					role="presentation"
				></div>
			</div>
			<span class="score" style="color: {color()};">{pct}%</span>
		</div>
		{#if !compact}
			<span class="label" style="color: {color()};">{label()}</span>
		{/if}
	</div>
{/if}

<style>
	.completeness-bar {
		display: flex;
		flex-direction: column;
		gap: 3px;
		width: 100%;
	}

	.completeness-bar.compact {
		gap: 0;
	}

	.bar-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.track {
		flex: 1;
		height: 6px;
		background: var(--border);
		border-radius: 999px;
		overflow: hidden;
		min-width: 40px;
	}

	.fill {
		height: 100%;
		border-radius: 999px;
		transition: width 0.3s ease, background 0.3s ease;
	}

	.score {
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		min-width: 32px;
		text-align: right;
		white-space: nowrap;
	}

	.label {
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.4px;
		line-height: 1;
	}
</style>

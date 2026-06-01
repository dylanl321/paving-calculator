<script lang="ts">
	interface Props {
		actual: number | null;
		target: number | null;
	}

	let { actual, target }: Props = $props();

	// Calculate position and status
	const status = $derived.by(() => {
		if (actual == null || target == null) return null;
		const diff = (actual - target) / target;
		if (Math.abs(diff) <= 0.05) return 'good';
		if (Math.abs(diff) <= 0.15) return 'warn';
		return 'bad';
	});

	const percentage = $derived.by(() => {
		if (actual == null || target == null) return 0;
		// Map to 0-100% scale where target is at 50%
		// Range: 70% of target (low) to 130% of target (high)
		const ratio = actual / target;
		const scaledRatio = (ratio - 0.7) / 0.6; // Maps 0.7-1.3 to 0-1
		return Math.max(0, Math.min(100, scaledRatio * 100));
	});

	const statusColor = $derived(
		status === 'good' ? 'var(--good)' : status === 'warn' ? 'var(--warn)' : 'var(--bad)'
	);
</script>

<div class="gauge-wrapper">
	<!-- Mobile: horizontal bar -->
	<div class="gauge-bar">
		<div class="zone zone-low"></div>
		<div class="zone zone-good"></div>
		<div class="zone zone-high"></div>
		{#if actual != null && target != null}
			<div class="needle-marker" style:left={`${percentage}%`} style:background={statusColor}></div>
		{/if}
	</div>

	<!-- Desktop: semi-circular gauge -->
	<svg class="gauge-dial" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
		<!-- Background arc zones -->
		<path
			d="M 20 100 A 80 80 0 0 1 60 35"
			fill="none"
			stroke="var(--bad)"
			stroke-width="16"
			stroke-linecap="round"
		/>
		<path
			d="M 60 35 A 80 80 0 0 1 140 35"
			fill="none"
			stroke="var(--good)"
			stroke-width="16"
			stroke-linecap="round"
		/>
		<path
			d="M 140 35 A 80 80 0 0 1 180 100"
			fill="none"
			stroke="var(--bad)"
			stroke-width="16"
			stroke-linecap="round"
		/>

		<!-- Needle -->
		{#if actual != null && target != null}
			{@const angle = -90 + (percentage / 100) * 180}
			<g transform="rotate({angle} 100 100)">
				<line
					x1="100"
					y1="100"
					x2="100"
					y2="30"
					stroke={statusColor}
					stroke-width="3"
					stroke-linecap="round"
				/>
				<circle cx="100" cy="100" r="6" fill={statusColor} />
			</g>
		{/if}

		<!-- Zone labels -->
		<text x="30" y="110" class="zone-label">Low</text>
		<text x="100" y="20" class="zone-label" text-anchor="middle">Target</text>
		<text x="170" y="110" class="zone-label" text-anchor="end">High</text>
	</svg>

	<div class="gauge-readout">
		<div class="readout-row">
			<span class="readout-label">Actual:</span>
			<span class="readout-value" style:color={statusColor}>
				{actual != null ? Math.round(actual).toLocaleString() : '—'}
			</span>
		</div>
		<div class="readout-row">
			<span class="readout-label">Target:</span>
			<span class="readout-value">{target != null ? Math.round(target).toLocaleString() : '—'}</span>
		</div>
	</div>
</div>

<style>
	.gauge-wrapper {
		margin: 16px 0;
	}

	/* Mobile: horizontal bar */
	.gauge-bar {
		display: flex;
		height: 32px;
		border-radius: 16px;
		overflow: hidden;
		position: relative;
		border: 1px solid var(--border);
	}

	.zone {
		flex: 1;
	}

	.zone-low {
		background: var(--bad);
		opacity: 0.3;
	}

	.zone-good {
		background: var(--good);
		opacity: 0.3;
	}

	.zone-high {
		background: var(--bad);
		opacity: 0.3;
	}

	.needle-marker {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 4px;
		transform: translateX(-50%);
		transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 0 8px currentColor;
	}

	/* Desktop: hide bar, show dial */
	.gauge-dial {
		display: none;
	}

	.gauge-readout {
		margin-top: 12px;
		display: flex;
		gap: 16px;
		justify-content: center;
		font-size: 0.85rem;
	}

	.readout-row {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.readout-label {
		color: var(--text-muted);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.readout-value {
		font-weight: 700;
		font-size: 1.1rem;
	}

	@media (min-width: 768px) {
		.gauge-bar {
			display: none;
		}

		.gauge-dial {
			display: block;
			max-width: 280px;
			margin: 0 auto;
		}

		.zone-label {
			fill: var(--text-muted);
			font-size: 10px;
			font-weight: 600;
		}

		.readout-row {
			flex-direction: row;
			gap: 8px;
		}

		.readout-label {
			font-size: 0.85rem;
		}

		.readout-value {
			font-size: 1.3rem;
		}
	}
</style>

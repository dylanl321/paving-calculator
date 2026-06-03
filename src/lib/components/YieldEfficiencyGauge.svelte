<script lang="ts">
	interface Props {
		yieldEfficiency: number | null;
		targetRate: number | null;
	}

	let { yieldEfficiency, targetRate }: Props = $props();

	const color = $derived.by(() => {
		if (yieldEfficiency == null) return 'var(--text-muted)';
		if (yieldEfficiency >= 95) return 'var(--good)';
		if (yieldEfficiency >= 85) return 'var(--warn)';
		return 'var(--bad)';
	});

	function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
		const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
		return {
			x: centerX + radius * Math.cos(angleInRadians),
			y: centerY + radius * Math.sin(angleInRadians)
		};
	}

	function describeArc(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
		const start = polarToCartesian(centerX, centerY, radius, endAngle);
		const end = polarToCartesian(centerX, centerY, radius, startAngle);
		const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
		return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
	}

	const arcPath = $derived.by(() => {
		if (yieldEfficiency == null) return '';
		const percentage = Math.max(0, Math.min(100, yieldEfficiency));
		const startAngle = -210;
		const endAngle = 30;
		const totalDegrees = endAngle - startAngle; // 240 degrees
		const filledEndAngle = startAngle + (percentage / 100) * totalDegrees;
		return describeArc(50, 54, 38, startAngle, filledEndAngle);
	});

	const backgroundArcPath = $derived.by(() => {
		return describeArc(50, 54, 38, -210, 30);
	});
</script>

<div class="yield-gauge">
	{#if yieldEfficiency == null}
		<div class="empty-state">
			<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
				<path
					d={backgroundArcPath}
					fill="none"
					stroke="var(--border)"
					stroke-width="8"
					stroke-linecap="round"
				/>
			</svg>
			<div class="gauge-text">
				<div class="gauge-value-placeholder">—</div>
				<div class="gauge-label">No spread data</div>
			</div>
		</div>
	{:else}
		<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
			<defs>
				<filter id="glow">
					<feGaussianBlur stdDeviation="2" result="coloredBlur" />
					<feMerge>
						<feMergeNode in="coloredBlur" />
						<feMergeNode in="SourceGraphic" />
					</feMerge>
				</filter>
			</defs>
			<path
				d={backgroundArcPath}
				fill="none"
				stroke="var(--border)"
				stroke-width="8"
				stroke-linecap="round"
				opacity="0.3"
			/>
			<path
				d={arcPath}
				fill="none"
				stroke={color}
				stroke-width="8"
				stroke-linecap="round"
				filter="url(#glow)"
			/>
		</svg>
		<div class="gauge-text">
			<div class="gauge-value" style:color={color}>{yieldEfficiency.toFixed(0)}%</div>
			<div class="gauge-label">Yield Efficiency</div>
			{#if targetRate != null}
				<div class="gauge-target">Target: {Math.round(targetRate)} lbs/SY</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.yield-gauge {
		position: relative;
		width: 100%;
		max-width: 280px;
		margin: 0 auto;
	}

	svg {
		width: 100%;
		height: auto;
	}

	.empty-state {
		position: relative;
	}

	.gauge-text {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -30%);
		text-align: center;
		width: 100%;
	}

	.gauge-value {
		font-size: var(--fs-3xl);
		font-weight: var(--fw-bold);
		line-height: 1;
		margin-bottom: var(--sp-1);
	}

	.gauge-value-placeholder {
		font-size: var(--fs-3xl);
		font-weight: var(--fw-bold);
		line-height: 1;
		margin-bottom: var(--sp-1);
		color: var(--text-muted);
	}

	.gauge-label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: var(--fw-medium);
	}

	.gauge-target {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: var(--sp-2);
	}

	@media (max-width: 460px) {
		.gauge-value {
			font-size: var(--fs-2xl);
		}

		.gauge-value-placeholder {
			font-size: var(--fs-2xl);
		}

		.gauge-label {
			font-size: var(--fs-xs);
		}

		.gauge-target {
			font-size: 10px;
		}
	}
</style>

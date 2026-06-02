<script lang="ts">
	interface Props {
		currentFeet: number;
		totalFeet: number;
	}

	let { currentFeet, totalFeet }: Props = $props();

	const percentage = $derived(
		totalFeet > 0 ? Math.min(Math.round((currentFeet / totalFeet) * 100), 100) : 0
	);
	const progressWidth = $derived(totalFeet > 0 ? (currentFeet / totalFeet) * 100 : 0);
</script>

<div class="progress-wrapper">
	<div class="progress-bar">
		<div class="progress-fill" style:width={`${progressWidth}%`}></div>
		<div class="progress-truck" style:left={`${progressWidth}%`}>
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
			>
				<rect x="1" y="8" width="14" height="10" rx="2" />
				<path d="M15 8h3l3 4v6h-3" />
				<circle cx="6" cy="18" r="2" />
				<circle cx="18" cy="18" r="2" />
			</svg>
		</div>
	</div>

	<div class="progress-labels">
		<span class="label-start">0 ft</span>
		<span class="label-pct">{percentage}%</span>
		<span class="label-end">{totalFeet.toLocaleString()} ft</span>
	</div>

	<!-- Desktop: show distance markers -->
	<div class="distance-markers">
		<div class="marker-line"></div>
		<div class="marker-current" style:left={`${progressWidth}%`}>
			{currentFeet.toLocaleString()} ft
		</div>
	</div>
</div>

<style>
	.progress-wrapper {
		margin: 16px 0;
		position: relative;
	}

	.progress-bar {
		position: relative;
		height: 24px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: visible;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent), var(--good));
		border-radius: 11px;
		transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.progress-truck {
		position: absolute;
		top: 50%;
		transform: translate(-50%, -50%);
		color: var(--text);
		background: var(--bg);
		border-radius: 50%;
		padding: 4px;
		border: 2px solid var(--accent);
		transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		pointer-events: none;
	}

	.progress-labels {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-top: 8px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.label-pct {
		font-weight: 700;
		color: var(--text);
		font-size: 0.85rem;
	}

	.distance-markers {
		display: none;
	}

	/* Desktop: richer visualization */
	@media (min-width: 768px) {
		.progress-bar {
			height: 32px;
		}

		.progress-truck {
			padding: 6px;
		}

		.progress-truck svg {
			width: 24px;
			height: 24px;
		}

		.progress-labels {
			font-size: 0.85rem;
		}

		.label-pct {
			font-size: 1rem;
		}

		.distance-markers {
			display: block;
			position: relative;
			margin-top: 12px;
			min-height: 28px;
		}

		.marker-line {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			height: 1px;
			background: var(--border);
		}

		.marker-current {
			position: absolute;
			top: 6px;
			transform: translateX(-50%);
			padding: 4px 10px;
			background: var(--accent);
			color: var(--accent-text);
			border-radius: 6px;
			font-size: 0.8rem;
			font-weight: 700;
			white-space: nowrap;
			transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
		}

		.marker-current::before {
			content: '';
			position: absolute;
			bottom: 100%;
			left: 50%;
			transform: translateX(-50%);
			width: 1px;
			height: 6px;
			background: var(--accent);
		}
	}
</style>

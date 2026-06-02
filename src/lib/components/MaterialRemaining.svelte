<script lang="ts">
	interface Props {
		loadsRemaining: number;
		tonsPerLoad: number;
	}

	let { loadsRemaining, tonsPerLoad }: Props = $props();

	const totalTons = $derived(Math.round(loadsRemaining * tonsPerLoad * 10) / 10);

	// Create array for truck icons (max 10 for visual clarity)
	const maxTrucks = 10;
	const trucksToShow = $derived(Math.min(loadsRemaining, maxTrucks));
	const truckArray = $derived(Array.from({ length: maxTrucks }, (_, i) => i < trucksToShow));
	const moreLoads = $derived(Math.max(0, loadsRemaining - maxTrucks));
</script>

<div class="material-wrapper">
	<!-- Mobile: simple count with bar -->
	<div class="mobile-view">
		<div class="count-row">
			<svg
				class="truck-icon"
				width="32"
				height="32"
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
			<div class="count-info">
				<div class="count-number">{loadsRemaining} loads</div>
				<div class="count-tons">{totalTons.toLocaleString()} tons</div>
			</div>
		</div>
		<div class="depletion-bar">
			<div class="depletion-fill" style:width={`${Math.min(100, (loadsRemaining / 10) * 100)}%`}></div>
		</div>
	</div>

	<!-- Desktop: truck icons grid -->
	<div class="desktop-view">
		<div class="truck-grid">
			{#each truckArray as active, i (i)}
				<div class="truck-item" class:active class:empty={!active}>
					<svg
						width="40"
						height="40"
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
					<span class="truck-label">{(i + 1) * tonsPerLoad}t</span>
				</div>
			{/each}
		</div>
		{#if moreLoads > 0}
			<div class="more-loads">+ {moreLoads} more loads ({(moreLoads * tonsPerLoad).toFixed(1)} tons)</div>
		{/if}
	</div>
</div>

<style>
	.material-wrapper {
		margin: 16px 0;
	}

	/* Mobile view */
	.mobile-view {
		display: block;
	}

	.count-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.truck-icon {
		color: var(--accent);
		flex-shrink: 0;
	}

	.count-info {
		flex: 1;
	}

	.count-number {
		font-size: 1.2rem;
		font-weight: 700;
		color: var(--text);
	}

	.count-tons {
		font-size: 0.8rem;
		color: var(--text-muted);
	}

	.depletion-bar {
		height: 8px;
		background: var(--surface);
		border-radius: 4px;
		margin-top: 8px;
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.depletion-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--good), var(--accent));
		border-radius: 3px;
		transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* Desktop view */
	.desktop-view {
		display: none;
	}

	@media (min-width: 768px) {
		.mobile-view {
			display: none;
		}

		.desktop-view {
			display: block;
		}

		.truck-grid {
			display: grid;
			grid-template-columns: repeat(5, 1fr);
			gap: 12px;
		}

		.truck-item {
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 6px;
			padding: 10px;
			background: var(--surface);
			border: 2px solid var(--border);
			border-radius: var(--radius);
			transition: all 0.3s ease;
		}

		.truck-item.active {
			border-color: var(--accent);
			background: var(--surface-alt);
		}

		.truck-item.active svg {
			color: var(--accent);
		}

		.truck-item.empty {
			opacity: 0.3;
		}

		.truck-item.empty svg {
			color: var(--text-muted);
		}

		.truck-label {
			font-size: 0.7rem;
			font-weight: 600;
			color: var(--text-muted);
		}

		.truck-item.active .truck-label {
			color: var(--accent);
		}

		.more-loads {
			text-align: center;
			margin-top: 12px;
			font-size: 0.85rem;
			color: var(--text-muted);
			font-weight: 600;
		}
	}
</style>

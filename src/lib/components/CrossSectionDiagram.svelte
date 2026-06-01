<script lang="ts">
	interface Props {
		compactedIn: number;
		looseIn: number;
	}

	let { compactedIn, looseIn }: Props = $props();

	// SVG dimensions and scaling
	const viewHeight = 200;
	const viewWidth = 300;
	const maxHeight = 160; // max visual height for material
	const baseY = 170; // baseline for road

	// Scale heights for visualization (clamp to reasonable max)
	const scale = $derived(Math.min(maxHeight / Math.max(looseIn, 4), 40));
	const compactedHeight = $derived(compactedIn * scale);
	const looseHeight = $derived(looseIn * scale);

	const compactedY = $derived(baseY - compactedHeight);
	const looseY = $derived(baseY - looseHeight);
</script>

<div class="diagram-wrapper">
	<svg class="cross-section" viewBox="0 0 {viewWidth} {viewHeight}" xmlns="http://www.w3.org/2000/svg">
		<!-- Base layer (existing road) -->
		<rect
			x="20"
			y={baseY}
			width="260"
			height="20"
			fill="var(--surface-alt)"
			stroke="var(--border)"
			stroke-width="1"
		/>
		<text x="150" y={baseY + 14} class="layer-label" text-anchor="middle">Existing Road Surface</text>

		<!-- Compacted layer -->
		<rect
			x="20"
			y={compactedY}
			width="260"
			height={compactedHeight}
			fill="var(--good)"
			opacity="0.4"
			stroke="var(--good)"
			stroke-width="2"
		/>

		<!-- Loose layer (only show if different) -->
		{#if Math.abs(looseIn - compactedIn) > 0.01}
			<rect
				x="20"
				y={looseY}
				width="260"
				height={looseHeight - compactedHeight}
				fill="var(--warn)"
				opacity="0.3"
				stroke="var(--warn)"
				stroke-width="1"
				stroke-dasharray="4,4"
			/>
		{/if}

		<!-- Dimension lines - Mobile: simple -->
		<g class="dims-mobile">
			<!-- Compacted dimension -->
			<line x1="290" y1={baseY} x2="290" y2={compactedY} stroke="var(--accent)" stroke-width="2" />
			<line x1="285" y1={baseY} x2="295" y2={baseY} stroke="var(--accent)" stroke-width="2" />
			<line x1="285" y1={compactedY} x2="295" y2={compactedY} stroke="var(--accent)" stroke-width="2" />
			<text x="305" y={(baseY + compactedY) / 2 + 4} class="dim-label">{compactedIn}"</text>

			<!-- Loose dimension (if different) -->
			{#if Math.abs(looseIn - compactedIn) > 0.01}
				<line x1="10" y1={compactedY} x2="10" y2={looseY} stroke="var(--text-muted)" stroke-width="1" />
				<line x1="5" y1={compactedY} x2="15" y2={compactedY} stroke="var(--text-muted)" stroke-width="1" />
				<line x1="5" y1={looseY} x2="15" y2={looseY} stroke="var(--text-muted)" stroke-width="1" />
				<text x="10" y={(compactedY + looseY) / 2 - 6} class="dim-label-small" text-anchor="middle">
					+{(looseIn - compactedIn).toFixed(2)}"
				</text>
			{/if}
		</g>

		<!-- Desktop: detailed annotations -->
		<g class="dims-desktop">
			<!-- Compacted dimension with label -->
			<line x1="290" y1={baseY} x2="290" y2={compactedY} stroke="var(--accent)" stroke-width="2" />
			<line x1="285" y1={baseY} x2="295" y2={baseY} stroke="var(--accent)" stroke-width="2" />
			<line x1="285" y1={compactedY} x2="295" y2={compactedY} stroke="var(--accent)" stroke-width="2" />
			<text x="305" y={(baseY + compactedY) / 2 - 4} class="dim-label-large">
				{compactedIn}" Compacted
			</text>

			<!-- Loose dimension -->
			{#if Math.abs(looseIn - compactedIn) > 0.01}
				<line x1="10" y1={baseY} x2="10" y2={looseY} stroke="var(--text-muted)" stroke-width="1.5" />
				<line x1="5" y1={baseY} x2="15" y2={baseY} stroke="var(--text-muted)" stroke-width="1.5" />
				<line x1="5" y1={looseY} x2="15" y2={looseY} stroke="var(--text-muted)" stroke-width="1.5" />
				<text x="10" y={(baseY + looseY) / 2 + 4} class="dim-label-large" text-anchor="middle">
					{looseIn}" Loose
				</text>
			{/if}

			<!-- Material labels -->
			<text x="150" y={compactedY + compactedHeight / 2} class="material-label" text-anchor="middle">
				Compacted Lift
			</text>
			{#if Math.abs(looseIn - compactedIn) > 0.01}
				<text x="150" y={looseY + (looseHeight - compactedHeight) / 2} class="material-label-loose" text-anchor="middle">
					Loose Material
				</text>
			{/if}
		</g>
	</svg>
</div>

<style>
	.diagram-wrapper {
		margin: 16px 0;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 12px;
	}

	.cross-section {
		width: 100%;
		height: auto;
		display: block;
	}

	.layer-label {
		fill: var(--text-muted);
		font-size: 8px;
		font-weight: 600;
	}

	.dim-label,
	.dim-label-small {
		fill: var(--accent);
		font-size: 11px;
		font-weight: 700;
	}

	.dim-label-small {
		font-size: 9px;
	}

	.dim-label-large {
		fill: var(--text);
		font-size: 10px;
		font-weight: 700;
	}

	.material-label,
	.material-label-loose {
		fill: var(--text);
		font-size: 10px;
		font-weight: 600;
		opacity: 0.8;
	}

	.material-label-loose {
		font-size: 9px;
		font-style: italic;
	}

	/* Mobile: show simple dimensions */
	.dims-mobile {
		display: block;
	}

	.dims-desktop {
		display: none;
	}

	@media (min-width: 768px) {
		.dims-mobile {
			display: none;
		}

		.dims-desktop {
			display: block;
		}

		.layer-label {
			font-size: 10px;
		}

		.dim-label-large {
			font-size: 12px;
		}

		.material-label {
			font-size: 12px;
		}

		.material-label-loose {
			font-size: 11px;
		}
	}
</style>

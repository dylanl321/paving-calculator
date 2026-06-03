<script lang="ts">
	import { fade, scale } from 'svelte/transition';

	export interface InspectorStat {
		label: string;
		value: string | null;
		unit?: string;
		highlight?: boolean;
		status?: 'good' | 'warn' | 'bad' | null;
	}

	interface Props {
		open: boolean;
		onclose: () => void;
		title: string;
		stats: InspectorStat[];
		note?: string;
	}

	let { open = $bindable(), onclose, title, stats, note }: Props = $props();

	function handleClose() {
		open = false;
		onclose();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			handleClose();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			handleClose();
		}
	}
</script>

{#if open}
	<div
		class="inspector-overlay"
		role="dialog"
		aria-modal="true"
		aria-labelledby="inspector-title"
		tabindex="-1"
		transition:fade={{ duration: 200 }}
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
	>
		<div class="inspector-panel" transition:scale={{ duration: 200, start: 0.95 }}>
			<div class="inspector-header">
				<h1 id="inspector-title" class="inspector-title">
					<svg class="title-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
					{title}
				</h1>
				<button class="close-button" onclick={handleClose} aria-label="Close inspector view">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
					</svg>
				</button>
			</div>

			<div class="stats-grid">
				{#each stats as stat}
					<div class="stat-card" class:highlight={stat.highlight}>
						<div class="stat-label">{stat.label}</div>
						<div class="stat-value-row">
							<div class="stat-value" class:has-status={stat.status}>
								{stat.value ?? '—'}
							</div>
							{#if stat.status}
								<div class="status-badge" class:good={stat.status === 'good'} class:warn={stat.status === 'warn'} class:bad={stat.status === 'bad'}>
									{#if stat.status === 'good'}
										<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
											<path d="M4 10L8 14L16 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
										</svg>
									{:else if stat.status === 'warn'}
										<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
											<path d="M10 2L18 16H2L10 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
											<path d="M10 7V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
											<circle cx="10" cy="14" r="1" fill="currentColor"/>
										</svg>
									{:else if stat.status === 'bad'}
										<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
											<circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2"/>
											<path d="M6 6L14 14M14 6L6 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
										</svg>
									{/if}
								</div>
							{/if}
						</div>
						{#if stat.unit}
							<div class="stat-unit">{stat.unit}</div>
						{/if}
					</div>
				{/each}
			</div>

			{#if note}
				<div class="inspector-note">{note}</div>
			{/if}

			<div class="tap-hint">Tap anywhere to close</div>
		</div>
	</div>
{/if}

<style>
	.inspector-overlay {
		position: fixed;
		inset: 0;
		z-index: 2000;
		background: rgba(0, 0, 0, 0.92);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--sp-4);
	}

	.inspector-panel {
		width: 100%;
		max-width: 600px;
		max-height: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--sp-6);
		overflow-y: auto;
	}

	.inspector-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
	}

	.inspector-title {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		font-size: var(--fs-xl);
		font-weight: var(--fw-bold);
		color: var(--accent);
		margin: 0;
	}

	.title-icon {
		flex-shrink: 0;
		color: var(--accent);
	}

	.close-button {
		flex-shrink: 0;
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(255, 255, 255, 0.1);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: var(--radius-md);
		color: white;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.15);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.close-button:active {
		transform: scale(0.95);
	}

	.stats-grid {
		display: grid;
		gap: var(--sp-4);
		grid-template-columns: 1fr;
	}

	@media (min-width: 500px) and (orientation: landscape) {
		.stats-grid {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.stat-card {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: var(--radius-md);
		padding: var(--sp-5);
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.stat-card.highlight {
		background: rgba(255, 215, 0, 0.12);
		border-color: rgba(255, 215, 0, 0.3);
	}

	.stat-label {
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: rgba(255, 255, 255, 0.6);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.stat-value-row {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
	}

	.stat-value {
		font-size: 4rem;
		font-weight: var(--fw-black);
		line-height: 1;
		color: white;
		letter-spacing: -0.02em;
	}

	.stat-value.has-status {
		flex: 1;
	}

	@media (max-width: 400px) {
		.stat-value {
			font-size: 3.5rem;
		}
	}

	.stat-card.highlight .stat-value {
		color: rgb(255, 215, 0);
	}

	.stat-unit {
		font-size: var(--fs-lg);
		font-weight: var(--fw-medium);
		color: rgba(255, 255, 255, 0.5);
	}

	.status-badge {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-badge.good {
		background: rgba(34, 197, 94, 0.2);
		color: rgb(34, 197, 94);
	}

	.status-badge.warn {
		background: rgba(251, 191, 36, 0.2);
		color: rgb(251, 191, 36);
	}

	.status-badge.bad {
		background: rgba(239, 68, 68, 0.2);
		color: rgb(239, 68, 68);
	}

	.inspector-note {
		padding: var(--sp-4);
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: var(--radius-md);
		font-size: var(--fs-sm);
		color: rgba(255, 255, 255, 0.7);
		text-align: center;
	}

	.tap-hint {
		text-align: center;
		font-size: var(--fs-xs);
		color: rgba(255, 255, 255, 0.4);
		font-weight: var(--fw-medium);
		padding: var(--sp-2);
	}
</style>

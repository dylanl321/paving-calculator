<script lang="ts">
	import type { CalcValueSource } from '../stores/calcContext.svelte';

	interface Props {
		source: CalcValueSource;
		updatedAt: number;
		label: string;
		value?: string;
		onOverride?: (val: string) => void;
	}

	let { source, updatedAt, label, value, onOverride }: Props = $props();

	let showTooltip = $state(false);
	let showOverride = $state(false);
	let overrideInput = $state('');

	const SOURCE_LABELS: Record<CalcValueSource, string> = {
		weather_api: 'Open-Meteo API',
		gps: 'GPS',
		config: 'Job Config',
		job_site: 'Job Site',
		manual: 'Manual entry',
		derived: 'Auto-derived'
	};

	const SOURCE_COLORS: Record<CalcValueSource, string> = {
		weather_api: '#60a5fa',
		gps: '#34d399',
		config: '#a78bfa',
		job_site: '#a78bfa',
		manual: '#f59e0b',
		derived: '#94a3b8'
	};

	function relativeTime(ts: number): string {
		const diff = Math.floor((Date.now() - ts) / 1000);
		if (diff < 60) return 'just now';
		if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
		if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
		return `${Math.floor(diff / 86400)} d ago`;
	}

	const tooltipText = $derived(() => {
		const parts: string[] = [label];
		if (value) parts[0] += `: ${value}`;
		parts.push(SOURCE_LABELS[source]);
		parts.push(relativeTime(updatedAt));
		return parts.join(' \u2014 ');
	});

	const color = $derived(SOURCE_COLORS[source]);
	const canOverride = $derived(source !== 'derived' && !!onOverride);

	function handleTap() {
		if (canOverride && !showOverride) {
			showOverride = true;
			showTooltip = false;
			overrideInput = value ?? '';
		} else {
			showTooltip = !showTooltip;
		}
	}

	function confirmOverride() {
		if (onOverride && overrideInput.trim()) {
			onOverride(overrideInput.trim());
		}
		showOverride = false;
	}

	function cancelOverride() {
		showOverride = false;
		overrideInput = '';
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') confirmOverride();
		if (e.key === 'Escape') cancelOverride();
	}
</script>

<!-- Wrapper keeps relative context for tooltip positioning -->
<span class="source-badge-wrap">
	<!-- Touch target: 48px via padding around 16px icon -->
	<button
		class="source-badge-btn"
		aria-label="{label} source: {SOURCE_LABELS[source]}"
		onclick={handleTap}
		onmouseenter={() => { showTooltip = true; }}
		onmouseleave={() => { showTooltip = false; }}
		type="button"
	>
		<span class="badge-icon" style="color: {color};">
			{#if source === 'weather_api'}
				<!-- Thermometer -->
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M8 2v7.27"/>
					<circle cx="8" cy="12" r="2" fill="currentColor"/>
					<path d="M8 2a1.5 1.5 0 0 1 1.5 1.5v5.77a3.5 3.5 0 1 1-3 0V3.5A1.5 1.5 0 0 1 8 2z" stroke-width="1.2"/>
				</svg>
			{:else if source === 'gps'}
				<!-- Location pin -->
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M8 14s-5-4.686-5-8a5 5 0 0 1 10 0c0 3.314-5 8-5 8z"/>
					<circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none"/>
				</svg>
			{:else if source === 'config' || source === 'job_site'}
				<!-- Gear/cog -->
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="8" cy="8" r="2.5"/>
					<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41"/>
				</svg>
			{:else if source === 'manual'}
				<!-- Pencil -->
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"/>
				</svg>
			{:else}
				<!-- Chain link (derived) -->
				<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M6 10a3 3 0 0 0 4.243 0l1.414-1.414a3 3 0 0 0-4.243-4.243L6 5.757"/>
					<path d="M10 6a3 3 0 0 0-4.243 0L4.343 7.414a3 3 0 0 0 4.243 4.243L10 10.243"/>
				</svg>
			{/if}
		</span>
	</button>

	<!-- Tooltip -->
	{#if showTooltip && !showOverride}
		<span class="badge-tooltip" role="tooltip">
			{tooltipText()}
		</span>
	{/if}

	<!-- Inline override input -->
	{#if showOverride}
		<span class="badge-override">
			<input
				class="override-input"
				type="text"
				bind:value={overrideInput}
				onkeydown={handleKeydown}
				placeholder={label}
				aria-label="Override {label}"
				autofocus
			/>
			<button
				class="override-btn override-confirm"
				type="button"
				onclick={confirmOverride}
				aria-label="Confirm override"
			>
				<!-- Checkmark -->
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M2 7l4 4 6-6"/>
				</svg>
			</button>
			<button
				class="override-btn override-cancel"
				type="button"
				onclick={cancelOverride}
				aria-label="Cancel override"
			>
				<!-- X -->
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M3 3l8 8M11 3l-8 8"/>
				</svg>
			</button>
		</span>
	{/if}
</span>

<style>
	.source-badge-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	/* 48px touch target via negative margin + padding */
	.source-badge-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		padding: 16px;
		margin: -16px;
		border-radius: 50%;
		color: inherit;
		transition: background 0.15s;
		-webkit-tap-highlight-color: transparent;
		position: relative;
		z-index: 1;
	}

	.source-badge-btn:hover,
	.source-badge-btn:focus-visible {
		background: rgba(255, 255, 255, 0.08);
		outline: none;
	}

	.source-badge-btn:focus-visible {
		outline: 2px solid #60a5fa;
		outline-offset: 2px;
	}

	.badge-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
	}

	/* Tooltip */
	.badge-tooltip {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		background: #0f172a;
		border: 1px solid #334155;
		color: #e2e8f0;
		font-size: 12px;
		line-height: 1.4;
		padding: 6px 10px;
		border-radius: 6px;
		white-space: nowrap;
		pointer-events: none;
		z-index: 50;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		/* Fallback: try to keep tooltip on screen */
		max-width: min(320px, calc(100vw - 16px));
		white-space: normal;
	}

	.badge-tooltip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 5px solid transparent;
		border-top-color: #334155;
	}

	/* Inline override */
	.badge-override {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 4px;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 6px 8px;
		z-index: 50;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
		white-space: nowrap;
	}

	.override-input {
		background: #0f172a;
		border: 1px solid #475569;
		border-radius: 4px;
		color: #e2e8f0;
		font-size: 13px;
		padding: 4px 8px;
		width: 100px;
		min-width: 80px;
		outline: none;
	}

	.override-input:focus {
		border-color: #60a5fa;
	}

	.override-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s;
		flex-shrink: 0;
	}

	.override-confirm {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
	}

	.override-confirm:hover {
		background: rgba(52, 211, 153, 0.25);
	}

	.override-cancel {
		background: rgba(248, 113, 113, 0.15);
		color: #f87171;
	}

	.override-cancel:hover {
		background: rgba(248, 113, 113, 0.25);
	}
</style>

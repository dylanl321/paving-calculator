<script lang="ts">
	interface Props {
		specRef: string;
		validationId: string;
		value: string;
		label?: string;
		tableRef?: string;
	}

	let { specRef, validationId, value, label, tableRef }: Props = $props();

	let showPopover = $state(false);

	const SPEC_SECTIONS: Record<string, { name: string; section: string }> = {
		'SS-400.3.01': { name: 'Spread Rate — General Requirements', section: 'Section 400.3.01' },
		'SS-400.3.02': { name: 'Spread Rate — Designated Rate', section: 'Section 400.3.02' },
		'SS-400.3.03': { name: 'Spread Rate — Tolerance (Table 12)', section: 'Section 400.3.03' },
		'SS-400.3.04': { name: 'Spread Rate — Acceptance Criteria', section: 'Section 400.3.04' },
		'SS-400.2.01': { name: 'Tack Coat — Application Rate', section: 'Section 400.2.01' },
		'SS-400.2.02': { name: 'Tack Coat — Table 2 Ranges', section: 'Section 400.2.02' },
		'SS-400.4.01': { name: 'Lift Thickness — Minimum Air Temp', section: 'Section 400.4.01' },
		'SS-400.4.02': { name: 'Lift Thickness — Table 4', section: 'Section 400.4.02' },
		'SS-400.5.01': { name: 'Mix Type — Layer Thickness', section: 'Section 400.5.01' },
		'SS-400.5.02': { name: 'Mix Type — Table 5', section: 'Section 400.5.02' }
	};

	const specInfo = $derived(SPEC_SECTIONS[specRef]);
	const displayText = $derived(() => {
		const parts: string[] = [];
		if (label) parts.push(`${label}:`);
		parts.push(value);
		return parts.join(' ');
	});

	const chipText = $derived(() => {
		const parts = [`GDOT SS ${specRef.replace('SS-', '')}`];
		if (tableRef) parts.push(tableRef);
		return parts.join(', ');
	});

	function togglePopover() {
		showPopover = !showPopover;
	}

	function closePopover() {
		showPopover = false;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') closePopover();
	}
</script>

<span class="spec-tooltip-wrap">
	<span class="spec-value">{displayText()}</span>
	<span class="spec-separator">—</span>
	<button
		class="spec-chip"
		type="button"
		aria-label="View specification details for {chipText()}"
		aria-expanded={showPopover}
		onclick={togglePopover}
		onkeydown={handleKeydown}
	>
		{chipText()}
	</button>

	{#if showPopover}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="popover-backdrop" onclick={closePopover}></div>
		<div class="spec-popover" role="dialog" aria-label="Specification details">
			{#if specInfo}
				<div class="popover-section">
					<div class="popover-label">Specification</div>
					<div class="popover-value">{specInfo.name}</div>
					<div class="popover-meta">{specInfo.section}</div>
				</div>
			{/if}

			{#if tableRef}
				<div class="popover-section">
					<div class="popover-label">Reference</div>
					<div class="popover-value">{tableRef}</div>
				</div>
			{/if}

			<div class="popover-section">
				<div class="popover-label">Validation ID</div>
				<div class="popover-value popover-mono">{validationId}</div>
			</div>

			<div class="popover-note">
				GDOT Section 400 — Asphalt Concrete Pavement
			</div>

			<button class="popover-dismiss" type="button" onclick={closePopover} aria-label="Close">
				<!-- X icon -->
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M3 3l8 8M11 3l-8 8"/>
				</svg>
			</button>
		</div>
	{/if}
</span>

<style>
	.spec-tooltip-wrap {
		position: relative;
		display: inline-flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
		font-size: 14px;
		line-height: 1.5;
	}

	.spec-value {
		color: #e2e8f0;
		font-weight: 500;
	}

	.spec-separator {
		color: #94a3b8;
	}

	/* Spec chip button with 48px touch target */
	.spec-chip {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: rgba(96, 165, 250, 0.15);
		border: 1px solid rgba(96, 165, 250, 0.3);
		color: #60a5fa;
		font-size: 12px;
		font-weight: 600;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s;
		-webkit-tap-highlight-color: transparent;
		/* Padding trick for 48px touch target - match SourceBadge.svelte pattern */
		padding: 16px;
		margin: -12px;
		position: relative;
	}

	.spec-chip:hover,
	.spec-chip:focus-visible {
		background: rgba(96, 165, 250, 0.25);
		border-color: rgba(96, 165, 250, 0.5);
		outline: none;
	}

	.spec-chip:focus-visible {
		outline: 2px solid #60a5fa;
		outline-offset: 2px;
	}

	/* Backdrop for click-outside */
	.popover-backdrop {
		position: fixed;
		inset: 0;
		z-index: 49;
	}

	/* Popover */
	.spec-popover {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 0;
		background: #0f172a;
		border: 1px solid #334155;
		border-radius: 8px;
		padding: 12px;
		min-width: 280px;
		max-width: min(360px, calc(100vw - 32px));
		z-index: 50;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
		color: #e2e8f0;
		font-size: 13px;
		line-height: 1.4;
	}

	.spec-popover::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 20px;
		border: 6px solid transparent;
		border-top-color: #334155;
	}

	.popover-section {
		margin-bottom: 10px;
	}

	.popover-section:last-of-type {
		margin-bottom: 0;
	}

	.popover-label {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		color: #94a3b8;
		letter-spacing: 0.5px;
		margin-bottom: 4px;
	}

	.popover-value {
		color: #e2e8f0;
		font-weight: 500;
	}

	.popover-meta {
		font-size: 12px;
		color: #94a3b8;
		margin-top: 2px;
	}

	.popover-mono {
		font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
		font-size: 12px;
	}

	.popover-note {
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid #1e293b;
		font-size: 11px;
		color: #94a3b8;
		font-style: italic;
	}

	.popover-dismiss {
		position: absolute;
		top: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		background: none;
		border: none;
		border-radius: 4px;
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.15s;
	}

	.popover-dismiss:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #e2e8f0;
	}

	.popover-dismiss:focus-visible {
		outline: 2px solid #60a5fa;
		outline-offset: 1px;
	}
</style>

<!--
  Usage:
  <SpecTooltip specRef='SS-400.3.04' validationId='SR-001' value='112.3 lbs/SY' label='Spread Rate' tableRef='Table 12' />

  Renders: Spread Rate: 112.3 lbs/SY — GDOT SS 400.3.04, Table 12
  Tap the spec chip for the popover.
-->

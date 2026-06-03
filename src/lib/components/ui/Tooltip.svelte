<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';

	let {
		term,
		definition,
		children
	}: {
		term: string;
		definition: string;
		children?: import('svelte').Snippet;
	} = $props();

	let show = $state(false);
	let triggerEl = $state<HTMLElement | null>(null);
	let tooltipEl = $state<HTMLElement | null>(null);
	let isTouchDevice = $state(false);
	let tooltipId = $state(`tooltip-${Math.random().toString(36).slice(2, 9)}`);

	onMount(() => {
		if (browser) {
			isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		}
	});

	function handleTriggerClick() {
		if (isTouchDevice) {
			show = !show;
		}
	}

	function handleMouseEnter() {
		if (!isTouchDevice) {
			show = true;
		}
	}

	function handleMouseLeave() {
		if (!isTouchDevice) {
			show = false;
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (
			isTouchDevice &&
			show &&
			triggerEl &&
			!triggerEl.contains(event.target as Node) &&
			tooltipEl &&
			!tooltipEl.contains(event.target as Node)
		) {
			show = false;
		}
	}

	$effect(() => {
		if (browser && isTouchDevice) {
			document.addEventListener('click', handleClickOutside);
			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});
</script>

{#if children}
	<span
		class="tooltip-trigger with-slot"
		bind:this={triggerEl}
		onclick={handleTriggerClick}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		aria-describedby={show ? tooltipId : undefined}
		role="button"
		tabindex="0"
	>
		{@render children()}
		{#if show}
			<span class="tooltip-popup" bind:this={tooltipEl} id={tooltipId} role="tooltip">
				<strong class="tooltip-term">{term}</strong>
				<span class="tooltip-definition">{definition}</span>
			</span>
		{/if}
	</span>
{:else}
	<span
		class="tooltip-trigger"
		bind:this={triggerEl}
		onclick={handleTriggerClick}
		onmouseenter={handleMouseEnter}
		onmouseleave={handleMouseLeave}
		aria-describedby={show ? tooltipId : undefined}
		role="button"
		tabindex="0"
	>
		<svg
			class="info-icon"
			width="16"
			height="16"
			viewBox="0 0 16 16"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.5" />
			<path d="M8 7V11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
			<circle cx="8" cy="4.5" r="0.75" fill="currentColor" />
		</svg>
		{#if show}
			<span class="tooltip-popup" bind:this={tooltipEl} id={tooltipId} role="tooltip">
				<strong class="tooltip-term">{term}</strong>
				<span class="tooltip-definition">{definition}</span>
			</span>
		{/if}
	</span>
{/if}

<style>
	.tooltip-trigger {
		position: relative;
		display: inline-flex;
		align-items: center;
		cursor: pointer;
		outline: none;
	}

	.tooltip-trigger.with-slot {
		display: inline;
	}

	.info-icon {
		color: var(--text-muted);
		transition: color 0.15s ease;
		flex-shrink: 0;
	}

	.tooltip-trigger:hover .info-icon,
	.tooltip-trigger:focus .info-icon {
		color: var(--accent);
	}

	.tooltip-popup {
		position: absolute;
		bottom: calc(100% + 8px);
		left: 50%;
		transform: translateX(-50%);
		max-width: 280px;
		padding: 10px 12px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 100;
		pointer-events: auto;
		animation: tooltipFadeIn 0.2s ease;
	}

	.tooltip-term {
		display: block;
		font-size: var(--fs-sm);
		font-weight: var(--fw-bold);
		color: var(--accent);
		margin-bottom: 4px;
	}

	.tooltip-definition {
		display: block;
		font-size: var(--fs-xs);
		line-height: 1.4;
		color: var(--text);
	}

	@keyframes tooltipFadeIn {
		from {
			opacity: 0;
			transform: translateX(-50%) translateY(4px);
		}
		to {
			opacity: 1;
			transform: translateX(-50%) translateY(0);
		}
	}
</style>

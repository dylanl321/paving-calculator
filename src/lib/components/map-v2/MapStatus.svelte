<script lang="ts" module>
	export type MapStatusKind = 'loading' | 'empty' | 'error';
</script>

<script lang="ts">
	/**
	 * MapStatus — one standardized loading / empty / error surface for the embedded
	 * map editors so users stop seeing the multi-stage "text Loading → blank →
	 * spinner → tiles" flash. A single clear state per kind, themed via tokens
	 * (no hardcoded hex), with a 48px-min action slot for empty-state CTAs.
	 *
	 * Usage:
	 *   <MapStatus kind="empty"
	 *     title="No route yet"
	 *     message="Draw or import the alignment to start.">
	 *     {#snippet action()}<Button onclick={load}>Load centerline</Button>{/snippet}
	 *   </MapStatus>
	 */
	import type { Snippet } from 'svelte';

	let {
		kind = 'loading',
		title,
		message,
		height = '320px',
		action
	}: {
		kind?: MapStatusKind;
		/** Headline; sensible per-kind default when omitted. */
		title?: string;
		/** Supporting line; sensible per-kind default when omitted. */
		message?: string;
		/** Matches the map height it stands in for, so layout doesn't jump. */
		height?: string;
		/** Optional CTA (e.g. a Button) shown under the empty/error message. */
		action?: Snippet;
	} = $props();

	const resolvedTitle = $derived(
		title ??
			(kind === 'loading'
				? 'Loading map'
				: kind === 'error'
					? 'Map unavailable'
					: 'No route yet')
	);
	const resolvedMessage = $derived(
		message ??
			(kind === 'loading'
				? null
				: kind === 'error'
					? 'Something went wrong loading this map.'
					: 'Draw or import the alignment to start.')
	);
</script>

<div class="map-status map-status--{kind}" style:min-height={height} aria-live="polite">
	{#if kind === 'loading'}
		<span class="map-status__spinner" aria-hidden="true"></span>
		<p class="map-status__title">{resolvedTitle}</p>
	{:else}
		<svg
			class="map-status__icon"
			width="32"
			height="32"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.8"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			{#if kind === 'error'}
				<circle cx="12" cy="12" r="9"></circle>
				<line x1="12" y1="8" x2="12" y2="12"></line>
				<line x1="12" y1="16" x2="12.01" y2="16"></line>
			{:else}
				<path d="M9 18l6-12M4 7l5-3 6 3 5-3v13l-5 3-6-3-5 3z"></path>
			{/if}
		</svg>
		<p class="map-status__title">{resolvedTitle}</p>
		{#if resolvedMessage}
			<p class="map-status__message">{resolvedMessage}</p>
		{/if}
		{#if action}
			<div class="map-status__action">{@render action()}</div>
		{/if}
	{/if}
</div>

<style>
	.map-status {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2, 8px);
		width: 100%;
		padding: var(--sp-6, 32px) var(--sp-5, 24px);
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.map-status--error {
		color: var(--bad);
		border-color: color-mix(in srgb, var(--bad) 35%, var(--border));
	}

	.map-status__icon {
		opacity: 0.6;
	}

	.map-status__title {
		margin: 0;
		font-size: var(--fs-md, 0.9375rem);
		font-weight: var(--fw-semibold, 600);
		color: var(--text);
	}

	.map-status--error .map-status__title {
		color: var(--bad);
	}

	.map-status__message {
		margin: 0;
		font-size: var(--fs-sm, 0.85rem);
		max-width: 340px;
		line-height: 1.45;
	}

	.map-status__action {
		margin-top: var(--sp-2, 8px);
		min-height: var(--touch, 48px);
		display: flex;
		align-items: center;
	}

	.map-status__spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: map-status-spin 0.8s linear infinite;
	}

	@keyframes map-status-spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.map-status__spinner {
			animation: none;
		}
	}
</style>

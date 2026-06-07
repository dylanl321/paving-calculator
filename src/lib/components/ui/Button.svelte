<!--
	Button — the single button primitive that mirrors the global
	`.btn`/`.btn-primary`/`.btn-secondary`/`.btn-ghost` semantics from app.css,
	plus a `danger` variant. Renders as an <a> when `href` is provided (so links
	and buttons share one look + 48px touch target).

	Usage:
		Button onclick={save} renders a primary button.
		Button variant="ghost" size="sm" renders a small ghost button.
		Button variant="danger" onclick={remove} renders a destructive button.
		Button href="/dashboard/projects" renders an anchor styled as a button.

	Props: variant (primary|secondary|ghost|danger), size (sm|md), block,
	type (button|submit|reset), disabled, href, plus any extra attributes
	(aria-*, title, etc.) forwarded via `...rest`.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes, HTMLAnchorAttributes } from 'svelte/elements';

	let {
		variant = 'primary',
		size = 'md',
		block = false,
		type = 'button',
		disabled = false,
		href,
		onclick,
		children,
		...rest
	}: {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md';
		block?: boolean;
		type?: 'button' | 'submit' | 'reset';
		disabled?: boolean;
		href?: string;
		onclick?: (event: MouseEvent) => void;
		children?: Snippet;
	} & Omit<HTMLButtonAttributes & HTMLAnchorAttributes, 'type' | 'href' | 'onclick'> = $props();
</script>

{#if href && !disabled}
	<a
		{href}
		class="btn btn--{variant} btn--{size}"
		class:btn--block={block}
		{onclick}
		{...rest}
	>
		{#if children}{@render children()}{/if}
	</a>
{:else}
	<button
		{type}
		class="btn btn--{variant} btn--{size}"
		class:btn--block={block}
		{disabled}
		{onclick}
		{...rest}
	>
		{#if children}{@render children()}{/if}
	</button>
{/if}

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--sp-2);
		min-height: var(--touch);
		padding: 0 var(--sp-5);
		border-radius: var(--radius-md);
		border: 1px solid transparent;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
		font-family: inherit;
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background var(--dur) var(--ease),
			border-color var(--dur) var(--ease),
			color var(--dur) var(--ease),
			opacity var(--dur) var(--ease),
			transform var(--dur) var(--ease);
	}

	.btn:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.btn--block {
		display: flex;
		width: 100%;
	}

	/* Variants — mirror the global .btn-* semantics */
	.btn--primary {
		background: var(--accent);
		color: var(--accent-text);
	}
	.btn--primary:hover:not(:disabled) {
		filter: brightness(1.05);
	}

	.btn--secondary {
		background: transparent;
		color: var(--text-muted);
		border-color: var(--border);
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}
	.btn--secondary:hover:not(:disabled) {
		background: var(--surface-hover);
		color: var(--text);
		border-color: var(--text-muted);
	}

	.btn--ghost {
		background: var(--surface);
		color: var(--text);
		border-color: var(--border);
	}
	.btn--ghost:hover:not(:disabled) {
		background: var(--surface-hover);
	}

	.btn--danger {
		background: var(--bad);
		color: var(--accent-text);
	}
	.btn--danger:hover:not(:disabled) {
		filter: brightness(1.05);
	}

	/* Sizes */
	.btn--sm {
		min-height: 44px;
		padding: 0 var(--sp-4);
		font-size: var(--fs-sm);
		border-radius: var(--radius-sm);
	}

	@media (prefers-reduced-motion: no-preference) {
		.btn:active:not(:disabled) {
			transform: scale(0.96);
			transition: transform var(--dur-fast) var(--ease-spring);
		}
	}
</style>

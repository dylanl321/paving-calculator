<!--
	Badge — a small pill label. Token-driven tones reuse the semantic status
	color-mix pattern from app.css (.status-banner) so badges theme correctly.

	Usage:
		<Badge>Default</Badge>
		<Badge tone="good">Verified</Badge>
		<Badge tone="accent" solid>New</Badge>

	Props: tone (neutral|accent|good|warn|bad), solid (filled vs tinted),
	uppercase (default true — matches existing status-badge styling).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		tone = 'neutral',
		solid = false,
		uppercase = true,
		children
	}: {
		tone?: 'neutral' | 'accent' | 'good' | 'warn' | 'bad';
		solid?: boolean;
		uppercase?: boolean;
		children?: Snippet;
	} = $props();
</script>

<span class="badge badge--{tone}" class:badge--solid={solid} class:badge--upper={uppercase}>
	{#if children}{@render children()}{/if}
</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--sp-1);
		padding: 4px 10px;
		border-radius: var(--radius-pill);
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		letter-spacing: 0.5px;
		line-height: 1.2;
		white-space: nowrap;
	}

	.badge--upper {
		text-transform: uppercase;
	}

	/* Tinted (default): color-mix surface tint + colored text */
	.badge--neutral {
		background: var(--surface-hover);
		color: var(--text-muted);
	}
	.badge--accent {
		background: color-mix(in srgb, var(--accent) 18%, transparent);
		color: var(--accent);
	}
	.badge--good {
		background: color-mix(in srgb, var(--good) 18%, transparent);
		color: var(--good);
	}
	.badge--warn {
		background: color-mix(in srgb, var(--warn) 18%, transparent);
		color: var(--warn);
	}
	.badge--bad {
		background: color-mix(in srgb, var(--bad) 18%, transparent);
		color: var(--bad);
	}

	/* Solid: filled accent/status background with readable text */
	.badge--solid.badge--neutral {
		background: var(--text-muted);
		color: var(--bg);
	}
	.badge--solid.badge--accent {
		background: var(--accent);
		color: var(--accent-text);
	}
	.badge--solid.badge--good {
		background: var(--good);
		color: var(--accent-text);
	}
	.badge--solid.badge--warn {
		background: var(--warn);
		color: var(--accent-text);
	}
	.badge--solid.badge--bad {
		background: var(--bad);
		color: var(--accent-text);
	}
</style>

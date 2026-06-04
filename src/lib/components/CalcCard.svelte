<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		title: string;
		purpose: string;
		/** Hide the in-card title (the workspace stage header already shows it) */
		hideTitle?: boolean;
		children: Snippet;
	}
	let { title, purpose, hideTitle = false, children }: Props = $props();
</script>

<section class="calc-card calc-card-animate">
	<header class="calc-head">
		{#if !hideTitle}<h2>{title}</h2>{/if}
		<p class="purpose">{purpose}</p>
	</header>
	{@render children()}
</section>

<style>
	.calc-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: var(--sp-5);
		margin-bottom: var(--sp-4);
	}

	/* Desktop density polish */
	@media (min-width: 1024px) {
		.calc-card {
			border-radius: 6px;
			padding: 1rem;
		}
	}

	.calc-head {
		margin-bottom: var(--sp-5);
	}
	.calc-head h2 {
		margin: 0 0 var(--sp-1);
		font-size: var(--fs-lg);
		font-weight: var(--fw-bold);
	}
	.purpose {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.45;
	}
</style>

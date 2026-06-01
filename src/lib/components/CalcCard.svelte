<script lang="ts">
	import type { Snippet } from 'svelte';
	interface Props {
		title: string;
		purpose: string;
		children: Snippet;
	}
	let { title, purpose, children }: Props = $props();
</script>

<section class="calc-card">
	<header class="calc-head">
		<h2>{title}</h2>
		<p class="purpose">{purpose}</p>
	</header>
	{@render children()}
</section>

<style>
	.calc-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 18px 16px;
		margin-bottom: 16px;
	}
	.calc-head {
		margin-bottom: 16px;
	}
	.calc-head h2 {
		margin: 0;
		font-size: 1.2rem;
	}
	.purpose {
		margin: 4px 0 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.35;
	}
</style>

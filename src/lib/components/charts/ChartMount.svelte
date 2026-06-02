<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';

	let { children }: { children: Snippet } = $props();

	let root: HTMLDivElement | undefined = $state();
	let ready = $state(false);

	onMount(() => {
		if (!root) return;

		const update = () => {
			if (!root) {
				ready = false;
				return;
			}
			const { width, height } = root.getBoundingClientRect();
			ready = width > 0 && height > 0;
		};

		const ro = new ResizeObserver(update);
		ro.observe(root);
		update();

		return () => {
			ready = false;
			ro.disconnect();
		};
	});
</script>

<div class="chart-mount" bind:this={root}>
	{#if ready}
		{@render children()}
	{/if}
</div>

<style>
	.chart-mount {
		width: 100%;
		height: 100%;
	}
</style>

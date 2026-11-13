<!--
	ErrorBoundary — catches a render error in its children and shows AppError
	with a retry, instead of a blank page. Restored from the June 2026 component
	that was deleted while nothing imported it; the root layout now wraps the
	page tree. Uses Svelte's svelte:boundary `failed` snippet.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import AppError from './AppError.svelte';

	type Props = {
		children?: Snippet;
		fallback?: Snippet<[{ error: unknown; reset: () => void }]>;
	};

	let { children, fallback }: Props = $props();
</script>

<svelte:boundary>
	{#if children}
		{@render children()}
	{/if}

	{#snippet failed(error, reset)}
		{#if fallback}
			{@render fallback({ error, reset })}
		{:else}
			<AppError
				type="page"
				message={error instanceof Error ? error.message : 'An unexpected error occurred'}
				onRetry={reset}
			/>
		{/if}
	{/snippet}
</svelte:boundary>

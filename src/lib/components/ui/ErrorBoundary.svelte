<script lang="ts">
	import { type Snippet } from 'svelte';
	import AppError from './AppError.svelte';

	type Props = {
		children?: Snippet;
		fallback?: Snippet<[{ error: unknown; reset: () => void }]>;
	};

	let { children, fallback }: Props = $props();

	let error = $state<unknown>(null);

	function reset() {
		error = null;
	}

	// Svelte 5 error boundary: onerror prop on <svelte:boundary>
</script>

<svelte:boundary onerror={(e) => (error = e)}>
	{#if error}
		{#if fallback}
			{@render fallback({ error, reset })}
		{:else}
			<AppError
				type="page"
				message={error instanceof Error ? error.message : 'An unexpected error occurred'}
				onRetry={reset}
			/>
		{/if}
	{:else if children}
		{@render children()}
	{/if}
</svelte:boundary>

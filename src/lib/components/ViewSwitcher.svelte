<script lang="ts">
	import { goto } from '$app/navigation';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';

	interface Props {
		currentView: 'field' | 'full';
	}

	let { currentView }: Props = $props();

	let switching = $state(false);

	// Laborer role stays in field tier; switching to "full" goes to /app (calcs), not /dashboard
	const isLaborer = $derived(authStore.org?.role === 'laborer');
	const label = $derived(currentView === 'field' ? 'Switch to Full View' : 'Switch to Simple View');
	const targetView = $derived(currentView === 'field' ? 'full' : 'field');
	const targetPath = $derived(
		currentView === 'field'
			? (isLaborer ? '/app' : '/dashboard')
			: '/app/field'
	);

	async function handleSwitch() {
		if (switching) return;
		switching = true;
		try {
			const res = await fetch('/api/user/preferred-view', {
				method: 'PATCH',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ preferred_view: targetView })
			});
			if (!res.ok) {
				const data = (await res.json()) as { error?: string };
				throw new Error(data.error || 'Failed to update view preference');
			}
			await goto(targetPath);
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Could not switch view');
			switching = false;
		}
	}
</script>

<div class="view-switcher">
	<button
		class="switcher-btn"
		onclick={handleSwitch}
		disabled={switching}
		aria-label={label}
	>
		{#if switching}
			<span class="spinner" aria-hidden="true"></span>
			Switching…
		{:else}
			<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				{#if currentView === 'field'}
					<!-- expand icon -->
					<polyline points="15 3 21 3 21 9"></polyline>
					<polyline points="9 21 3 21 3 15"></polyline>
					<line x1="21" y1="3" x2="14" y2="10"></line>
					<line x1="3" y1="21" x2="10" y2="14"></line>
				{:else}
					<!-- compress icon -->
					<polyline points="4 14 10 14 10 20"></polyline>
					<polyline points="20 10 14 10 14 4"></polyline>
					<line x1="10" y1="14" x2="3" y2="21"></line>
					<line x1="21" y1="3" x2="14" y2="10"></line>
				{/if}
			</svg>
			{label}
		{/if}
	</button>
</div>

<style>
	.view-switcher {
		padding: 0 16px 16px;
	}

	.switcher-btn {
		width: 100%;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 12px 16px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.9rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}

	.switcher-btn:hover:not(:disabled) {
		background: var(--surface);
		color: var(--text);
		border-color: var(--text-muted);
	}

	.switcher-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid var(--border);
		border-top-color: var(--text-muted);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>

<script lang="ts">
	import { offlineStore } from '$lib/stores/offline.svelte';
</script>

{#if !offlineStore.isOnline}
	<div class="offline-banner" role="alert" aria-live="assertive">
		<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
			<line x1="1" y1="1" x2="23" y2="23"/>
			<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
		</svg>
		<span>You are offline — changes will sync when reconnected</span>
		{#if offlineStore.pendingCount > 0}
			<span class="badge">{offlineStore.pendingCount} pending</span>
		{/if}
	</div>
{/if}

<style>
	.offline-banner {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 9999;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		background: var(--warn, #d97706);
		color: #1b2228;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.icon {
		width: 1rem;
		height: 1rem;
		flex-shrink: 0;
	}

	.badge {
		margin-left: auto;
		background: rgba(0, 0, 0, 0.2);
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
		font-size: 0.75rem;
	}
</style>

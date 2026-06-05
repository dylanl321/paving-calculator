<!-- OfflineBadge — small inline badge shown on cards that need server data when offline.
     Usage: <OfflineBadge /> renders only when offlineStore.isOnline === false. -->
<script lang="ts">
	import { offlineStore } from '$lib/stores/offline.svelte';
</script>

{#if !offlineStore.isOnline}
	<span class="offline-badge" aria-label="Offline — using cached data">
		<svg class="offline-badge__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
			<line x1="1" y1="1" x2="23" y2="23"/>
			<path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/>
		</svg>
		Offline — using cached data
	</span>
{/if}

<style>
	.offline-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 8px;
		border-radius: 9999px;
		background: color-mix(in srgb, var(--warn, #d97706) 15%, transparent);
		border: 1px solid color-mix(in srgb, var(--warn, #d97706) 40%, transparent);
		color: var(--warn, #d97706);
		font-size: 0.6875rem;
		font-weight: 600;
		line-height: 1;
		letter-spacing: 0.01em;
		white-space: nowrap;
	}

	.offline-badge__icon {
		width: 10px;
		height: 10px;
		flex-shrink: 0;
	}
</style>

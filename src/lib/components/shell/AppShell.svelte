<script lang="ts">
	import type { Snippet } from 'svelte';
	import NavSidebar from './NavSidebar.svelte';
	import { APP_VERSION } from '$lib/version';
	import { offlineStore } from '$lib/stores/offline.svelte';
	import OfflineExportButton from '$lib/components/OfflineExportButton.svelte';

	let {
		children,
		context,
		hasContext = false
	}: {
		children: Snippet;
		context?: Snippet;
		hasContext?: boolean;
	} = $props();

	const showContext = $derived(hasContext && !!context);
	const showExportButton = $derived(!offlineStore.isOnline || offlineStore.pendingCount > 0);

	const lastSyncText = $derived.by(() => {
		if (!offlineStore.lastSyncedAt) return null;
		const hours = offlineStore.lastSyncedAt.getHours();
		const minutes = offlineStore.lastSyncedAt.getMinutes();
		const ampm = hours >= 12 ? 'PM' : 'AM';
		const displayHours = hours % 12 || 12;
		const displayMinutes = minutes.toString().padStart(2, '0');
		return `${displayHours}:${displayMinutes} ${ampm}`;
	});
</script>

<div class="shell" class:with-context={showContext}>
	<NavSidebar />

	<main class="shell-main">
		{@render children()}
	</main>

	<footer class="shell-footer">
		{#if showExportButton}
			<div class="export-container">
				<OfflineExportButton />
			</div>
		{/if}
		<div class="offline-badge">
			<span class="status-dot" class:status-dot--online={offlineStore.isOnline} class:status-dot--offline={!offlineStore.isOnline}></span>
			{#if !offlineStore.isOnline}
				<span class="offline-text">Offline</span>
			{:else if offlineStore.isSyncing}
				<span class="offline-text">Syncing...</span>
			{:else if offlineStore.pendingCount > 0}
				<span class="offline-text">{offlineStore.pendingCount} pending</span>
			{:else if lastSyncText}
				<span class="offline-text offline-text--muted">Last synced: {lastSyncText}</span>
			{/if}
		</div>
		<span class="version-label">v{APP_VERSION}</span>
	</footer>

	{#if showContext && context}
		<aside class="shell-context">
			{@render context()}
		</aside>
	{/if}
</div>

<style>
	/* Mobile-first: a single column. Sidebar renders its own mobile top bar /
	   drawer, the main content stacks below, the context panel is hidden
	   (its data lives inline on mobile). */
	.shell {
		display: block;
		min-height: 100vh;
	}

	.shell-main {
		padding: 12px 16px calc(40px + env(safe-area-inset-bottom));
	}

	.shell-context {
		display: none;
	}

	.shell-footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 8px 16px calc(8px + env(safe-area-inset-bottom));
		border-top: 1px solid var(--border);
		background: var(--surface);
	}

	.export-container {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	.offline-badge {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.75rem;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-dot--online {
		background: var(--good, #22c55e);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--good, #22c55e) 20%, transparent);
	}

	.status-dot--offline {
		background: var(--bad, #ef4444);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--bad, #ef4444) 20%, transparent);
	}

	.offline-text {
		color: var(--text);
		font-weight: 500;
	}

	.offline-text--muted {
		color: var(--text-muted);
		font-weight: 400;
	}

	.version-label {
		font-size: 0.75rem;
		color: var(--text-muted);
		opacity: 0.6;
	}

	/* Tablet / iPad: icon-rail sidebar + content + job-site settings panel. */
	@media (min-width: 768px) {
		.shell {
			display: grid;
			grid-template-columns: var(--sidebar-rail-w) 1fr;
		}

		.shell.with-context {
			grid-template-columns: var(--sidebar-rail-w) 1fr var(--context-w);
		}

		.shell-main {
			min-width: 0;
			padding: 20px 24px 48px;
		}

		.shell.with-context .shell-context {
			display: block;
			border-left: 1px solid var(--border);
			background: var(--surface);
			min-height: 100vh;
		}

		.shell-context > :global(*) {
			position: sticky;
			top: 0;
			max-height: 100vh;
			overflow-y: auto;
			padding: 20px 18px;
		}
	}

	/* Desktop: full label sidebar. */
	@media (min-width: 1100px) {
		.shell {
			grid-template-columns: var(--sidebar-w) 1fr;
		}

		.shell.with-context {
			grid-template-columns: var(--sidebar-w) 1fr var(--context-w);
		}

		.shell-main {
			padding: 28px 32px 56px;
			max-width: 1400px;
			margin: 0 auto;
			width: 100%;
		}

		.shell-context > :global(*) {
			padding: 28px 22px;
		}
	}
</style>

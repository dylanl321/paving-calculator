<script lang="ts">
	import { CircleHelp, Search, PanelLeftClose, PanelLeftOpen } from 'lucide-svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import UserMenu from '$lib/components/UserMenu.svelte';
	import { navCollapsedStore } from '$lib/stores/navCollapsed.svelte';
	import { triggerOnboarding } from '$lib/stores/onboarding';
	import { config } from '$lib/config';

	let {
		onOpenPalette,
		isAuthenticated,
		isCollapsed,
		orgName
	}: {
		onOpenPalette: () => void;
		isAuthenticated: boolean;
		isCollapsed: boolean;
		orgName: string | null;
	} = $props();
</script>

<div class="sidebar-footer" class:nav-collapsed={isCollapsed}>
	<div class="footer-actions">
		<ThemeToggle />
		<UserMenu direction="up" align="left" />
	</div>
	<div class="footer-tools">
		<button
			class="cmd-trigger-btn"
			onclick={onOpenPalette}
			aria-label="Open command palette"
			title="Search (Ctrl+K / Cmd+K)"
		>
			<Search size={18} aria-hidden="true" />
			<span class="cmd-trigger-label">Search</span>
			<kbd class="cmd-kbd">⌘K</kbd>
		</button>
		{#if isAuthenticated}
			<button
				class="icon-tool-btn"
				onclick={triggerOnboarding}
				aria-label="Replay tutorial"
				title="Replay tutorial"
			>
				<CircleHelp size={18} aria-hidden="true" />
			</button>
		{/if}
		<button
			class="icon-tool-btn"
			onclick={() => navCollapsedStore.toggle()}
			aria-label={navCollapsedStore.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			title={navCollapsedStore.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
		>
			{#if navCollapsedStore.collapsed}
				<PanelLeftOpen size={18} aria-hidden="true" />
			{:else}
				<PanelLeftClose size={18} aria-hidden="true" />
			{/if}
		</button>
	</div>
	{#if orgName}
		<a href="/app" class="powered-by">
			<img src="/icons/icon-192.png" alt="" />
			<span>Powered by {config.app.name}</span>
		</a>
	{/if}
</div>

<style>
	.sidebar-footer {
		margin-top: auto;
		border-top: 1px solid var(--border);
		padding: 10px 12px;
		flex-shrink: 0;
	}

	.footer-actions {
		display: flex;
		align-items: center;
		gap: 8px;
		justify-content: space-between;
	}

	.powered-by {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-top: 10px;
		color: var(--text-muted);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.2px;
		text-decoration: none;
		transition: color var(--dur-normal) var(--ease);
	}

	.powered-by:hover {
		color: var(--text);
	}

	.powered-by img {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		flex-shrink: 0;
	}

	.footer-tools {
		display: none;
	}

	.cmd-trigger-btn {
		display: none;
	}

	@media (min-width: 900px) and (max-width: 1099px) {
		.footer-actions {
			flex-direction: column;
			gap: 10px;
		}

		.powered-by {
			justify-content: center;
		}

		.powered-by span {
			display: none;
		}
	}

	@media (min-width: 1100px) {
		.footer-actions {
			flex-direction: row;
		}

		.powered-by {
			justify-content: flex-start;
		}

		.powered-by span {
			display: inline;
		}

		.footer-tools {
			display: flex;
			align-items: center;
			gap: 6px;
			margin-top: 8px;
		}

		.cmd-trigger-btn {
			flex: 1;
			display: flex;
			align-items: center;
			gap: 8px;
			min-height: 36px;
			padding: 0 10px;
			background: var(--surface-alt);
			border: 1px solid var(--border);
			border-radius: 8px;
			color: var(--text-muted);
			cursor: pointer;
			font-size: 0.85rem;
			font-family: inherit;
			transition: background var(--dur-normal) var(--ease), color var(--dur-normal) var(--ease);
		}

		.cmd-trigger-btn:hover {
			background: var(--surface-hover);
			color: var(--text);
		}

		.cmd-trigger-label {
			flex: 1;
			text-align: left;
		}

		.cmd-kbd {
			font-size: 0.7rem;
			color: var(--text-muted);
			background: var(--surface);
			border: 1px solid var(--border);
			border-radius: 4px;
			padding: 1px 4px;
			font-family: inherit;
		}

		.icon-tool-btn {
			display: flex;
			align-items: center;
			justify-content: center;
			min-width: 36px;
			min-height: 36px;
			background: var(--surface-alt);
			border: 1px solid var(--border);
			border-radius: 8px;
			color: var(--text-muted);
			cursor: pointer;
			transition: background var(--dur-normal) var(--ease), color var(--dur-normal) var(--ease);
		}

		.icon-tool-btn:hover {
			background: var(--surface-hover);
			color: var(--text);
		}
	}

	/* Collapsed state on desktop */
	@media (min-width: 1100px) {
		.sidebar-footer.nav-collapsed .footer-actions {
			flex-direction: column;
			gap: 10px;
		}

		.sidebar-footer.nav-collapsed .footer-tools {
			flex-direction: column;
		}

		.sidebar-footer.nav-collapsed .cmd-trigger-btn {
			flex: none;
			min-width: 36px;
			min-height: 36px;
			padding: 0;
			justify-content: center;
		}

		.sidebar-footer.nav-collapsed .cmd-trigger-label,
		.sidebar-footer.nav-collapsed .cmd-kbd {
			display: none;
		}

		.sidebar-footer.nav-collapsed .powered-by {
			justify-content: center;
		}

		.sidebar-footer.nav-collapsed .powered-by span {
			display: none;
		}

		.sidebar-footer.nav-collapsed .footer-tools {
			margin-top: 10px;
		}
	}

	@media (max-height: 760px) and (min-width: 900px) {
		.sidebar-footer {
			padding: 8px;
		}

		.powered-by {
			display: none;
		}
	}

	@media (max-height: 640px) and (min-width: 900px) {
		.footer-actions {
			display: none;
		}

		.footer-tools {
			margin-top: 0;
		}
	}
</style>

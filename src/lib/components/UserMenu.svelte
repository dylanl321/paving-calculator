<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { orgSettingsStore } from '$lib/stores/orgSettings.svelte';
	import { goto } from '$app/navigation';
	import { scale } from 'svelte/transition';
	import { getInitials } from '$lib/utils/format';

	let {
		direction = 'down',
		align = 'right'
	}: { direction?: 'up' | 'down'; align?: 'left' | 'right' } = $props();

	let open = $state(false);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	async function handleLogout() {
		await authStore.logout();
		orgSettingsStore.clear();
		close();
		goto('/');
	}
</script>

<svelte:window onclick={(e) => {
	const target = e.target as HTMLElement;
	if (!target.closest('.user-menu')) {
		close();
	}
}} />

<div class="user-menu">
	{#if authStore.isAuthenticated && authStore.user}
		<button class="avatar-btn" onclick={toggle} aria-label="User menu">
			{getInitials(authStore.user.name)}
		</button>

		{#if open}
			<div
				class="dropdown"
				class:up={direction === 'up'}
				class:align-left={align === 'left'}
				transition:scale={{ duration: 160, start: 0.95 }}
			>
				<div class="user-info">
					<div class="name">{authStore.user.name}</div>
					<div class="email">{authStore.user.email}</div>
					{#if authStore.org}
						<div class="org">{authStore.org.name}</div>
					{/if}
				</div>
				<div class="divider"></div>
				<a href="/dashboard" class="menu-item" onclick={close}>Dashboard</a>
				<button class="menu-item" onclick={handleLogout}>Logout</button>
			</div>
		{/if}
	{:else if !authStore.loading}
		<a href="/login" class="login-link">Login</a>
	{/if}
</div>

<style>
	.user-menu {
		position: relative;
	}

	.avatar-btn {
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: 12px;
		font-weight: 700;
		font-size: 0.9rem;
		cursor: pointer;
		transition:
			opacity var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
	}

	.avatar-btn:hover {
		opacity: 0.9;
	}

	@media (prefers-reduced-motion: no-preference) {
		.avatar-btn:active {
			transform: scale(0.96);
		}
	}

	.login-link {
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 20px;
		background: var(--accent);
		border: none;
		border-radius: 12px;
		color: var(--accent-text);
		font-weight: 700;
		font-size: 0.9rem;
		transition:
			opacity var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
	}

	.login-link:hover {
		opacity: 0.9;
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: max-content;
		min-width: 240px;
		max-width: min(280px, calc(100vw - 24px));
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
	}

	/* Open upward when anchored at the bottom of the viewport (sidebar footer). */
	.dropdown.up {
		top: auto;
		bottom: calc(100% + 8px);
	}

	/* Anchor to the left edge so the menu opens rightward (narrow icon rail). */
	.dropdown.align-left {
		right: auto;
		left: 0;
	}

	.user-info {
		padding: 14px 16px;
	}

	.name {
		font-weight: 600;
		font-size: 0.95rem;
		margin-bottom: 2px;
	}

	.email {
		font-size: 0.8rem;
		color: var(--text-muted);
		margin-bottom: 4px;
	}

	.org {
		font-size: 0.75rem;
		color: var(--text-muted);
		background: var(--bg);
		padding: 4px 8px;
		border-radius: 6px;
		display: inline-block;
		margin-top: 4px;
	}

	.divider {
		height: 1px;
		background: var(--border);
	}

	.menu-item {
		display: block;
		width: 100%;
		padding: 12px 16px;
		text-align: left;
		background: none;
		border: none;
		color: var(--text);
		font-size: 0.9rem;
		cursor: pointer;
		transition:
			background var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
	}

	@media (prefers-reduced-motion: no-preference) {
		.menu-item:active {
			transform: scale(0.98);
		}
	}

	.menu-item:hover {
		background: var(--surface-alt);
	}

	.menu-item:first-of-type {
		border-radius: 0;
	}

	.menu-item:last-of-type {
		border-radius: 0 0 var(--radius) var(--radius);
	}
</style>

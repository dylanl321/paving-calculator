<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { goto } from '$app/navigation';

	let open = $state(false);

	function toggle() {
		open = !open;
	}

	function close() {
		open = false;
	}

	async function handleLogout() {
		await authStore.logout();
		close();
		goto('/');
	}

	function getInitials(name: string): string {
		return name
			.split(' ')
			.map((n) => n[0])
			.join('')
			.toUpperCase()
			.slice(0, 2);
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
			<div class="dropdown">
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
		transition: opacity 0.2s;
	}

	.avatar-btn:hover {
		opacity: 0.9;
	}

	.avatar-btn:active {
		transform: scale(0.96);
	}

	.login-link {
		min-width: 48px;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		color: var(--text);
		font-weight: 600;
		font-size: 0.9rem;
		transition: background 0.2s;
	}

	.login-link:hover {
		background: var(--surface-alt);
	}

	.dropdown {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		min-width: 240px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 100;
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
		transition: background 0.2s;
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

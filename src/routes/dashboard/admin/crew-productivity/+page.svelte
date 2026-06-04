<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { api } from '$lib/utils/api-error';
	import CrewProductivityDashboard from '$lib/components/CrewProductivityDashboard.svelte';

	let userRole = $state<string | null>(null);
	let loading = $state(true);

	onMount(async () => {
		try {
			const userData = await api.get<{
				user?: unknown | null;
				org?: { role?: string | null } | null;
			}>('/api/auth/me');

			if (!userData.user) {
				goto('/login');
				return;
			}

			userRole = userData.org?.role ?? null;

			if (userRole !== 'owner' && userRole !== 'admin') {
				goto('/dashboard');
				return;
			}

			loading = false;
		} catch (error) {
			console.error('Failed to check user role:', error);
			goto('/dashboard');
		}
	});
</script>

<svelte:head>
	<title>Crew Productivity — PaveRate</title>
</svelte:head>

{#if loading}
	<div class="loading-page">
		<div class="spinner"></div>
		<span>Loading...</span>
	</div>
{:else if userRole === 'owner' || userRole === 'admin'}
	<div class="page-container">
		<div class="page-header">
			<div>
				<a href="/dashboard" class="back-link">
					<svg
						width="20"
						height="20"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<polyline points="15 18 9 12 15 6"></polyline>
					</svg>
					Back to Dashboard
				</a>
				<h1 class="page-title">Crew Productivity</h1>
			</div>
		</div>

		<CrewProductivityDashboard />
	</div>
{/if}

<style>
	.loading-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 16px;
		min-height: 400px;
		color: var(--text-muted);
	}

	.spinner {
		width: 32px;
		height: 32px;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.page-container {
		width: 100%;
		max-width: 1200px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.85rem;
		margin-bottom: 12px;
		transition: color 0.15s;
	}

	.back-link:hover {
		color: var(--accent);
	}

	.page-title {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
	}
</style>

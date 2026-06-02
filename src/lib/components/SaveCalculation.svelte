<script lang="ts">
	import { authStore } from '$lib/stores/auth.svelte';
	import { browser } from '$app/environment';

	interface SaveCalcProps {
		calcType: 'spread_rate' | 'feet_left' | 'tonnage' | 'tack_rate' | 'stick_check';
		inputs: object;
		result: object;
		enabled?: boolean;
	}

	let { calcType, inputs, result, enabled = true }: SaveCalcProps = $props();

	let saving = $state(false);
	let saved = $state(false);
	let error = $state('');

	const jobSiteId = $derived(
		browser ? new URLSearchParams(window.location.search).get('job_site_id') : null
	);

	const canSave = $derived(
		authStore.isAuthenticated && jobSiteId && enabled && !saved && !saving
	);

	async function handleSave() {
		if (!jobSiteId) return;

		saving = true;
		error = '';

		try {
			const res = await fetch('/api/calculations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					job_site_id: jobSiteId,
					calc_type: calcType,
					inputs,
					result
				}),
				credentials: 'include'
			});

			const data = await res.json();

			if (!res.ok) {
				error = data.error || 'Failed to save';
				saving = false;
				return;
			}

			saved = true;
			setTimeout(() => {
				saved = false;
			}, 3000);
		} catch (err) {
			error = 'Network error';
		} finally {
			saving = false;
		}
	}
</script>

{#if canSave}
	<button class="save-btn" onclick={handleSave} disabled={saving}>
		{#if saving}
			<svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<line x1="12" y1="2" x2="12" y2="6"></line>
				<line x1="12" y1="18" x2="12" y2="22"></line>
				<line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
				<line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
				<line x1="2" y1="12" x2="6" y2="12"></line>
				<line x1="18" y1="12" x2="22" y2="12"></line>
				<line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
				<line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
			</svg>
			Saving...
		{:else}
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
				<polyline points="17 21 17 13 7 13 7 21"></polyline>
				<polyline points="7 3 7 8 15 8"></polyline>
			</svg>
			Save to Job Site
		{/if}
	</button>
{:else if saved}
	<div class="save-success">
		<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
			<polyline points="20 6 9 17 4 12"></polyline>
		</svg>
		Saved!
	</div>
{/if}

{#if error}
	<div class="save-error">{error}</div>
{/if}

<style>
	.save-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 20px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.save-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.save-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.save-btn:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	.save-success {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 12px 20px;
		background: var(--good);
		color: var(--accent-text);
		border-radius: var(--radius);
		font-size: 0.95rem;
		font-weight: 600;
	}

	.save-error {
		margin-top: 8px;
		padding: 10px 14px;
		background: rgba(var(--bad-rgb, 255, 100, 100), 0.1);
		border: 1px solid var(--bad);
		border-radius: var(--radius);
		color: var(--bad);
		font-size: 0.85rem;
	}
</style>

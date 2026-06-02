<script lang="ts">
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let name = $state('');
	let password = $state('');
	let loading = $state(false);

	async function handleNewUserSubmit(e: Event) {
		e.preventDefault();

		if (!data.invitation?.token) return;

		if (password.length < 8) {
			toastStore.error('Password must be at least 8 characters');
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/auth/accept-invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					token: data.invitation.token,
					name,
					password
				})
			});

			const result = await response.json();

			if (!response.ok) {
				toastStore.error(result.error || 'Failed to accept invitation');
				loading = false;
				return;
			}

			toastStore.success(`Welcome to ${data.org?.name}!`);
			goto('/dashboard');
		} catch (error) {
			toastStore.error('An error occurred');
			loading = false;
		}
	}

	async function handleExistingUserSubmit(e: Event) {
		e.preventDefault();

		if (!data.invitation?.token) return;

		loading = true;

		try {
			const response = await fetch('/api/auth/accept-invite', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					token: data.invitation.token,
					existingUser: true
				})
			});

			const result = await response.json();

			if (!response.ok) {
				toastStore.error(result.error || 'Failed to accept invitation');
				loading = false;
				return;
			}

			toastStore.success(`Welcome to ${data.org?.name}!`);
			goto('/dashboard');
		} catch (error) {
			toastStore.error('An error occurred');
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Accept Invitation — {config.app.name}</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-container">
		<div class="auth-card">
			<div class="auth-logo">
				<img class="logo-badge" src="/logo-wordmark.png" alt="PaveRate" />
			</div>

			{#if data.error === 'missing_token'}
				<h1>Invalid invitation link.</h1>
				<p class="error-text">The invitation link you followed is invalid.</p>
				<a href="/login" class="submit-btn">Go to Login</a>
			{:else if data.error === 'invalid_token'}
				<h1>Invalid invitation link.</h1>
				<p class="error-text">This invitation link is invalid.</p>
				<a href="/login" class="submit-btn">Go to Login</a>
			{:else if data.error === 'already_accepted'}
				<h1>Already accepted</h1>
				<p class="error-text">This invitation has already been accepted.</p>
				<a href="/login" class="submit-btn">Go to Login</a>
			{:else if data.error === 'expired'}
				<h1>Invitation expired</h1>
				<p class="error-text">This invitation has expired. Please ask your admin to send a new one.</p>
				<a href="/login" class="submit-btn">Go to Login</a>
			{:else if data.existingUser}
				<h1>Join {data.org?.name}</h1>
				<p class="info-text">You already have a PaveRate account. Click below to join {data.org?.name}.</p>
				<form onsubmit={handleExistingUserSubmit}>
					<button type="submit" class="submit-btn" disabled={loading}>
						{loading ? 'Accepting...' : 'Accept & Sign In'}
					</button>
				</form>
			{:else}
				<h1>Join {data.org?.name}</h1>
				<p class="info-text">Create your account to join {data.org?.name} on PaveRate.</p>

				<form onsubmit={handleNewUserSubmit}>
					<div class="form-field">
						<label for="email">Email</label>
						<input
							type="email"
							id="email"
							value={data.invitation?.email || ''}
							readonly
							disabled
						/>
					</div>

					<div class="form-field">
						<label for="name">Your Name</label>
						<input
							type="text"
							id="name"
							bind:value={name}
							required
							autocomplete="name"
							placeholder="John Doe"
						/>
					</div>

					<div class="form-field">
						<label for="password">Password</label>
						<input
							type="password"
							id="password"
							bind:value={password}
							required
							autocomplete="new-password"
							placeholder="••••••••"
							minlength="8"
						/>
						<div class="field-hint">Minimum 8 characters</div>
					</div>

					<button type="submit" class="submit-btn" disabled={loading}>
						{loading ? 'Creating account...' : `Join ${data.org?.name}`}
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>

<style>
	.auth-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.auth-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px 16px;
	}

	.auth-card {
		width: 100%;
		max-width: 420px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 32px 24px;
	}

	.auth-logo {
		text-align: center;
		margin-bottom: 32px;
	}

	.auth-logo img.logo-badge {
		width: auto;
		height: 120px;
		border-radius: 0;
		margin-bottom: 16px;
		filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.4));
	}

	h1 {
		margin: 0 0 12px;
		font-size: 1.5rem;
		text-align: center;
	}

	.error-text,
	.info-text {
		margin: 0 0 28px;
		color: var(--text-muted);
		font-size: 0.9rem;
		text-align: center;
		line-height: 1.5;
	}

	.form-field {
		margin-bottom: 20px;
	}

	.form-field label {
		display: block;
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 8px;
	}

	.form-field input {
		width: 100%;
		min-height: var(--touch);
		padding: 0 16px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 1rem;
		transition: border-color 0.2s;
	}

	.form-field input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.form-field input:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.field-hint {
		margin-top: 6px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.submit-btn {
		width: 100%;
		min-height: var(--touch);
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
		text-decoration: none;
		display: inline-block;
		text-align: center;
		line-height: var(--touch);
	}

	.submit-btn:hover:not(:disabled) {
		opacity: 0.9;
	}

	.submit-btn:active:not(:disabled) {
		transform: scale(0.98);
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>

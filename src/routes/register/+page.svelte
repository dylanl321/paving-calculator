<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let orgName = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			toastStore.error(error);
			return;
		}

		loading = true;

		const result = await authStore.register(name, email, password, orgName);

		if (result.error) {
			error = result.error;
			toastStore.error(result.error);
			loading = false;
		} else {
			toastStore.success('Account created successfully');
			goto('/dashboard');
		}
	}
</script>

<svelte:head>
	<title>Register — {config.app.name}</title>
</svelte:head>

<div class="auth-page">
	<header class="auth-header">
		<a href="/" class="back-link">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M19 12H5M12 19l-7-7 7-7"/>
			</svg>
			Back to Calculator
		</a>
		<ThemeToggle />
	</header>

	<div class="auth-container">
		<div class="auth-card">
			<div class="auth-logo">
				<img class="logo-badge" src="/logo-wordmark.png" alt="Paverate" />
				<h1>Create account</h1>
				<p>Start tracking your paving jobs</p>
			</div>

			<form onsubmit={handleSubmit}>
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
					<label for="email">Email</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						required
						autocomplete="email"
						placeholder="your@email.com"
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

				<div class="form-field">
					<label for="org-name">Organization Name</label>
					<input
						type="text"
						id="org-name"
						bind:value={orgName}
						required
						placeholder="ACME Paving Co."
					/>
				</div>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}

				<button type="submit" class="submit-btn" disabled={loading}>
					{loading ? 'Creating account...' : 'Create Account'}
				</button>
			</form>

			<div class="auth-footer">
				Already have an account? <a href="/login" class="link">Login</a>
			</div>
		</div>
	</div>
</div>

<style>
	.auth-page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.auth-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 16px;
		max-width: var(--maxw);
		width: 100%;
		margin: 0 auto;
	}

	.back-link {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--text-muted);
		font-size: 0.9rem;
		transition: color 0.2s;
	}

	.back-link:hover {
		color: var(--text);
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

	.auth-logo h1 {
		margin: 0 0 8px;
		font-size: 1.5rem;
	}

	.auth-logo p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
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

	.field-hint {
		margin-top: 6px;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.error-message {
		padding: 12px 16px;
		background: rgba(var(--bad-rgb, 255, 100, 100), 0.1);
		border: 1px solid var(--bad);
		border-radius: var(--radius);
		color: var(--bad);
		font-size: 0.9rem;
		margin-bottom: 20px;
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

	.auth-footer {
		margin-top: 24px;
		text-align: center;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.link {
		color: var(--accent);
		font-weight: 600;
	}

	.link:hover {
		text-decoration: underline;
	}
</style>

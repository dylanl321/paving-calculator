<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let orgName = $state('');

	// General server-error banner
	let serverError = $state('');
	// Per-field inline errors
	let fieldErrors = $state<Record<string, string>>({});
	let loading = $state(false);
	let successMsg = $state('');
	let emailExistsHint = $state(false);
	let retryAfterSeconds = $state(0);
	let retryInterval: ReturnType<typeof setInterval> | null = null;

	onDestroy(() => {
		if (retryInterval) {
			clearInterval(retryInterval);
		}
	});

	function validateFields(): boolean {
		emailExistsHint = false;
		const errs: Record<string, string> = {};
		if (!name.trim()) {
			errs.name = 'Name is required.';
		}
		if (!email.trim()) {
			errs.email = 'Email is required.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			errs.email = 'Enter a valid email address.';
		}
		if (!password) {
			errs.password = 'Password is required.';
		} else if (password.length < 8) {
			errs.password = 'Password must be at least 8 characters.';
		}
		if (password !== confirmPassword) {
			errs.confirmPassword = 'Passwords do not match.';
		}
		if (!orgName.trim()) {
			errs.orgName = 'Organization name is required.';
		}
		fieldErrors = errs;
		return Object.keys(errs).length === 0;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		serverError = '';
		fieldErrors = {};
		emailExistsHint = false;

		if (!validateFields()) return;

		loading = true;

		const result = await authStore.register(name, email, password, orgName);

		if (result.error) {
			// Handle specific error codes
			if (result.code === 'EMAIL_EXISTS') {
				fieldErrors = { ...fieldErrors, email: 'This email is already registered.' };
				emailExistsHint = true;
				toastStore.error('Email already registered');
			} else if (result.code === 'RATE_LIMITED') {
				serverError = result.error || 'Too many requests';
				retryAfterSeconds = result.retryAfter ?? 60;
				if (retryInterval) clearInterval(retryInterval);
				retryInterval = setInterval(() => {
					if (retryAfterSeconds > 0) {
						retryAfterSeconds--;
					} else {
						if (retryInterval) clearInterval(retryInterval);
						retryInterval = null;
					}
				}, 1000);
				toastStore.error(result.error);
			} else if (result.code === 'VALIDATION_FAILED_EMAIL') {
				fieldErrors = { ...fieldErrors, email: result.error };
				toastStore.error(result.error);
			} else if (result.code === 'VALIDATION_FAILED_PASSWORD') {
				fieldErrors = { ...fieldErrors, password: result.error };
				toastStore.error(result.error);
			} else if (result.code === 'VALIDATION_FAILED_NAME') {
				fieldErrors = { ...fieldErrors, name: result.error };
				toastStore.error(result.error);
			} else if (result.code === 'VALIDATION_FAILED_ORG') {
				fieldErrors = { ...fieldErrors, orgName: result.error };
				toastStore.error(result.error);
			} else {
				serverError = result.error;
				toastStore.error(result.error);
			}
			loading = false;
		} else {
			confirmPassword = '';
			successMsg = 'Account created! Redirecting to your dashboard...';
			toastStore.success('Account created successfully');
			setTimeout(() => goto('/dashboard'), 1200);
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

			{#if successMsg}
				<div class="success-banner" role="status" aria-live="polite">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
						<polyline points="22 4 12 14.01 9 11.01"/>
					</svg>
					{successMsg}
				</div>
			{/if}

			{#if serverError}
				<div class="error-banner" role="alert">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<circle cx="12" cy="12" r="10"/>
						<line x1="12" y1="8" x2="12" y2="12"/>
						<line x1="12" y1="16" x2="12.01" y2="16"/>
					</svg>
					{serverError}
					{#if retryAfterSeconds > 0}
						<span class="retry-countdown">Try again in {retryAfterSeconds}s</span>
					{/if}
				</div>
			{/if}

			<form onsubmit={handleSubmit} novalidate>
				<div class="form-field" class:has-error={!!fieldErrors.name}>
					<label for="name">Your Name</label>
					<input
						type="text"
						id="name"
						bind:value={name}
						autocomplete="name"
						placeholder="John Doe"
						aria-describedby={fieldErrors.name ? 'name-error' : undefined}
						aria-invalid={!!fieldErrors.name}
					/>
					{#if fieldErrors.name}
						<p class="field-error" id="name-error" role="alert">{fieldErrors.name}</p>
					{/if}
				</div>

				<div class="form-field" class:has-error={!!fieldErrors.email}>
					<label for="email">Email</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						autocomplete="email"
						placeholder="your@email.com"
						aria-describedby={fieldErrors.email ? 'email-error' : undefined}
						aria-invalid={!!fieldErrors.email}
					/>
					{#if fieldErrors.email}
						<p class="field-error" id="email-error" role="alert">{fieldErrors.email}</p>
					{/if}
					{#if emailExistsHint}
						<p class="field-hint"><a href="/login" class="link">Sign in instead?</a></p>
					{/if}
				</div>

				<div class="form-field" class:has-error={!!fieldErrors.password}>
					<label for="password">Password</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						autocomplete="new-password"
						placeholder="••••••••"
						aria-describedby={fieldErrors.password ? 'password-error' : 'password-hint'}
						aria-invalid={!!fieldErrors.password}
					/>
					{#if fieldErrors.password}
						<p class="field-error" id="password-error" role="alert">{fieldErrors.password}</p>
					{:else}
						<p class="field-hint" id="password-hint">Minimum 8 characters</p>
					{/if}
				</div>

				<div class="form-field" class:has-error={!!fieldErrors.confirmPassword}>
					<label for="confirm-password">Confirm Password</label>
					<input
						type="password"
						id="confirm-password"
						bind:value={confirmPassword}
						autocomplete="new-password"
						placeholder="••••••••"
						aria-describedby={fieldErrors.confirmPassword ? 'confirm-password-error' : undefined}
						aria-invalid={!!fieldErrors.confirmPassword}
					/>
					{#if fieldErrors.confirmPassword}
						<p class="field-error" id="confirm-password-error" role="alert">{fieldErrors.confirmPassword}</p>
					{/if}
				</div>

				<div class="form-field" class:has-error={!!fieldErrors.orgName}>
					<label for="org-name">Organization Name</label>
					<input
						type="text"
						id="org-name"
						bind:value={orgName}
						placeholder="ACME Paving Co."
						aria-describedby={fieldErrors.orgName ? 'org-error' : undefined}
						aria-invalid={!!fieldErrors.orgName}
					/>
					{#if fieldErrors.orgName}
						<p class="field-error" id="org-error" role="alert">{fieldErrors.orgName}</p>
					{/if}
				</div>

				<button type="submit" class="submit-btn" disabled={loading || !!successMsg || retryAfterSeconds > 0}>
					{#if loading}
						<svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
							<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
						</svg>
						Creating account...
					{:else}
						Create Account
					{/if}
				</button>
			</form>

			<div class="auth-footer">
				Already have an account? <a href="/login" class="link">Sign in</a>
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
		text-decoration: none;
		min-height: var(--touch);
		padding: 0 4px;
	}

	.back-link:hover {
		color: var(--text);
	}

	.auth-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px 16px 48px;
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
		margin-bottom: 28px;
	}

	.auth-logo img.logo-badge {
		width: auto;
		height: 120px;
		border-radius: 0;
		margin-bottom: 16px;
		display: block;
		margin-left: auto;
		margin-right: auto;
		filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.4));
	}

	.auth-logo h1 {
		margin: 0 0 8px;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
	}

	.auth-logo p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	/* ---- Banners ---- */
	.error-banner,
	.success-banner {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		padding: 12px 16px;
		border-radius: var(--radius);
		font-size: 0.9rem;
		margin-bottom: 20px;
		line-height: 1.4;
	}

	.error-banner {
		background: rgba(var(--bad-rgb, 220, 80, 80), 0.12);
		border: 1px solid var(--bad);
		color: var(--bad);
	}

	.success-banner {
		background: color-mix(in srgb, var(--good) 14%, transparent);
		border: 1px solid var(--good);
		color: var(--good);
	}

	.error-banner svg,
	.success-banner svg {
		flex-shrink: 0;
		margin-top: 1px;
	}

	/* ---- Form fields ---- */
	.form-field {
		margin-bottom: 18px;
	}

	.form-field label {
		display: block;
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 8px;
		color: var(--text);
	}

	.form-field input {
		width: 100%;
		min-height: var(--touch);
		padding: 0 16px;
		background: var(--bg);
		border: 1.5px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 1rem;
		transition:
			border-color 0.18s,
			box-shadow 0.18s;
		box-sizing: border-box;
	}

	.form-field input::placeholder {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.form-field input:focus {
		outline: none;
		border-color: var(--accent);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
	}

	/* Red border + glow on invalid field */
	.form-field.has-error input {
		border-color: var(--bad);
		background: rgba(var(--bad-rgb, 220, 80, 80), 0.06);
	}

	.form-field.has-error input:focus {
		border-color: var(--bad);
		box-shadow: 0 0 0 3px rgba(var(--bad-rgb, 220, 80, 80), 0.2);
	}

	.field-error {
		margin: 6px 0 0;
		font-size: 0.8rem;
		color: var(--bad);
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.field-hint {
		margin: 6px 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
	}

	/* ---- Submit button ---- */
	.submit-btn {
		width: 100%;
		min-height: var(--touch);
		margin-top: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 1rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 6px 18px -6px color-mix(in srgb, var(--accent) 55%, transparent);
		transition:
			transform 0.15s,
			box-shadow 0.15s,
			opacity 0.15s;
	}

	.submit-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 10px 24px -6px color-mix(in srgb, var(--accent) 65%, transparent);
	}

	.submit-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.submit-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	/* Spinner animation */
	.spinner {
		animation: spin 0.9s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
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
		text-decoration: none;
	}

	.link:hover {
		text-decoration: underline;
	}

	.retry-countdown {
		display: block;
		font-size: 0.8rem;
		margin-top: 4px;
		opacity: 0.85;
	}
</style>

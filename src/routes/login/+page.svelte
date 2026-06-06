<script lang="ts">
	import { goto } from '$app/navigation';
	import { dev } from '$app/environment';
	import { page } from '$app/stores';
	import { authStore } from '$lib/stores/auth.svelte';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let email = $state('');
	let password = $state('');

	// General server-error banner
	let serverError = $state('');
	// Per-field inline errors
	let fieldErrors = $state<Record<string, string>>({});
	let loading = $state(false);

	const resetSuccess = $page.url.searchParams.get('reset') === 'success';
	const showDevLogin = $derived(
		dev || $page.url.hostname === 'localhost' || $page.url.hostname === '127.0.0.1'
	);

	function validateFields(): boolean {
		const errs: Record<string, string> = {};
		if (!email.trim()) {
			errs.email = 'Email is required.';
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			errs.email = 'Enter a valid email address.';
		}
		if (!password) {
			errs.password = 'Password is required.';
		}
		fieldErrors = errs;
		return Object.keys(errs).length === 0;
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		serverError = '';
		fieldErrors = {};

		if (!validateFields()) return;

		loading = true;

		const result = await authStore.login(email, password);

		if (result.error) {
			serverError = result.error;
			toastStore.error(result.error);
			loading = false;
		} else {
			toastStore.success('Signed in successfully');
			goto(result.redirectTo || '/dashboard');
		}
	}

	async function handleDevLogin() {
		serverError = '';
		fieldErrors = {};
		loading = true;

		const result = await authStore.devLogin();

		if (result.error) {
			serverError = result.error;
			toastStore.error(result.error);
			loading = false;
		} else {
			toastStore.success('Dev login successful');
			goto(result.redirectTo || '/dashboard');
		}
	}
</script>

<svelte:head>
	<title>Sign in — {config.app.name}</title>
</svelte:head>

<div class="auth-page">
	<!-- Full-bleed road hero: asphalt receding to a clean vanishing point -->
	<div class="road" aria-hidden="true">
		<svg class="road-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
			<defs>
				<!-- Sky / atmosphere above the horizon -->
				<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#1a232b" />
					<stop offset="100%" stop-color="#33424e" />
				</linearGradient>
				<!-- Road surface: lighter near the horizon (haze), darker up close -->
				<linearGradient id="roadFace" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#3a4956" />
					<stop offset="18%" stop-color="#2e3b46" />
					<stop offset="100%" stop-color="#1b232a" />
				</linearGradient>
				<!-- Lane / edge paint: faint at the horizon, solid up close -->
				<linearGradient id="paintFade" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#f2c037" stop-opacity="0" />
					<stop offset="14%" stop-color="#f2c037" stop-opacity="0.85" />
					<stop offset="100%" stop-color="#f2c037" stop-opacity="1" />
				</linearGradient>
				<linearGradient id="edgeFade" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#cdd8e0" stop-opacity="0" />
					<stop offset="16%" stop-color="#cdd8e0" stop-opacity="0.5" />
					<stop offset="100%" stop-color="#cdd8e0" stop-opacity="0.78" />
				</linearGradient>
				<!-- Warm glow sitting on the vanishing point -->
				<radialGradient id="horizonGlow" cx="50%" cy="30%" r="42%">
					<stop offset="0%" stop-color="#5a6f7e" stop-opacity="0.55" />
					<stop offset="100%" stop-color="#5a6f7e" stop-opacity="0" />
				</radialGradient>
			</defs>

			<!-- Sky fills everything; the road is painted on top from the horizon down -->
			<rect width="1000" height="1000" fill="url(#sky)" />
			<rect width="1000" height="1000" fill="url(#horizonGlow)" />

			<!-- Road surface: edges + centre lane all converge to the vanishing point (500,300) -->
			<polygon points="500,300 910,1000 90,1000" fill="url(#roadFace)" />

			<!-- Solid edge lines, hugging the very edge of the roadway -->
			<polygon points="500,300 104,1000 86,1000" fill="url(#edgeFade)" />
			<polygon points="500,300 914,1000 896,1000" fill="url(#edgeFade)" />

			<!-- Centre lane dashes: all centered on x=500, converging at (500,300).
			     Each dash's half-width = depth * 18, so they taper perfectly. -->
			<g fill="url(#paintFade)">
				<polygon points="497.7,346 502.3,346 502.8,378 497.2,378" />
				<polygon points="496.6,408 503.4,408 504.1,452 495.9,452" />
				<polygon points="494.9,498 505.1,498 506.2,562 493.8,562" />
				<polygon points="492.4,628 507.6,628 509.3,720 490.7,720" />
				<polygon points="488.7,816 511.3,816 514.0,952 486.0,952" />
			</g>

			<!-- Subtle ground fade at the very bottom for depth -->
			<rect x="0" y="860" width="1000" height="140" fill="#11171c" opacity="0.35" />
		</svg>
		<div class="road-vignette"></div>
	</div>

	<header class="topbar">
		<a href="/" class="brand">
			<img class="brand-mark" src="/logo-mark.png" alt="" />
			<span>{config.app.name}</span>
		</a>
		<ThemeToggle />
	</header>

	<main class="auth-container">
		<div class="auth-card">
			<div class="auth-logo">
				<img class="logo-badge" src="/logo-wordmark.png" alt="{config.app.name}" />
				<h1>Welcome back</h1>
				<p>Sign in for saved projects, daily logs, imports, and team tools.</p>
			</div>

			{#if resetSuccess}
				<div class="success-banner" role="status">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
						<polyline points="22 4 12 14.01 9 11.01"/>
					</svg>
					Password reset successful! You can now sign in with your new password.
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
				</div>
			{/if}

			<form onsubmit={handleSubmit} novalidate>
				<div class="form-field" class:has-error={!!fieldErrors.email}>
					<label for="email">Email</label>
					<input
						type="email"
						id="email"
						bind:value={email}
						autocomplete="email"
						placeholder="you@company.com"
						aria-describedby={fieldErrors.email ? 'email-error' : undefined}
						aria-invalid={!!fieldErrors.email}
					/>
					{#if fieldErrors.email}
						<p class="field-error" id="email-error" role="alert">{fieldErrors.email}</p>
					{/if}
				</div>

				<div class="form-field" class:has-error={!!fieldErrors.password}>
					<label for="password">Password</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						autocomplete="current-password"
						placeholder="••••••••"
						aria-describedby={fieldErrors.password ? 'password-error' : undefined}
						aria-invalid={!!fieldErrors.password}
					/>
					{#if fieldErrors.password}
						<p class="field-error" id="password-error" role="alert">{fieldErrors.password}</p>
					{/if}
				</div>

				<button type="submit" class="submit-btn" disabled={loading}>
					{#if loading}
						<svg class="spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">
							<path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
						</svg>
						Signing in...
					{:else}
						Sign In
					{/if}
				</button>

				<div class="forgot-link">
					<a href="/forgot-password" class="link-subtle">Forgot password?</a>
				</div>
			</form>

			{#if showDevLogin}
				<button type="button" class="dev-btn" onclick={handleDevLogin} disabled={loading}>
					Dev login (local only)
				</button>
			{/if}

			<div class="auth-footer">
				Don't have an account? <a href="/register" class="link">Create one</a>
			</div>
		</div>

		<a href="/app" class="back-link">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
			Open free calculator
		</a>
	</main>
</div>

<style>
	.auth-page {
		position: relative;
		min-height: 100vh;
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ---- Road hero background ---- */
	.road {
		position: fixed;
		inset: 0;
		z-index: 0;
	}
	.road-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}
	/* Darkens the edges so the floating card reads clearly */
	.road-vignette {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(120% 90% at 50% 58%, rgba(15, 20, 24, 0) 38%, rgba(15, 20, 24, 0.72) 100%),
			linear-gradient(180deg, rgba(15, 20, 24, 0.35) 0%, rgba(15, 20, 24, 0) 26%);
	}

	/* ---- Top bar ---- */
	.topbar {
		position: relative;
		z-index: 2;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 18px 22px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0;
		text-decoration: none;
	}
	.brand-mark {
		width: 30px;
		height: 30px;
		display: block;
		object-fit: contain;
	}

	/* ---- Card ---- */
	.auth-container {
		position: relative;
		z-index: 2;
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 18px;
		padding: 24px 16px 56px;
	}

	.auth-card {
		width: 100%;
		max-width: 420px;
		padding: 40px 34px 30px;
		border-radius: 22px;
	}

	:global([data-theme='light']) .auth-card {
		background: rgba(255, 255, 255, 0.98);
		border: 1px solid rgba(0, 0, 0, 0.12);
		box-shadow:
			0 28px 70px -28px rgba(0, 0, 0, 0.8),
			inset 0 1px 0 rgba(255, 255, 255, 0.6);
	}

	:global([data-theme='dark']) .auth-card,
	:global([data-theme='sunlight']) .auth-card {
		background: rgba(24, 31, 37, 0.92);
		border: 1px solid rgba(159, 176, 189, 0.18);
		box-shadow:
			0 28px 70px -28px rgba(0, 0, 0, 0.8),
			inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}

	/* Frosted glass is a pure enhancement: only lean on transparency when the
	   browser actually supports (and paints) backdrop-filter. If it drops out,
	   the opaque backgrounds above keep the card legible over the road. */
	@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
		.auth-card {
			backdrop-filter: blur(18px) saturate(120%);
			-webkit-backdrop-filter: blur(18px) saturate(120%);
		}
		:global([data-theme='light']) .auth-card {
			background: rgba(255, 255, 255, 0.9);
		}
		:global([data-theme='dark']) .auth-card,
		:global([data-theme='sunlight']) .auth-card {
			background: rgba(24, 31, 37, 0.78);
		}
	}

	.auth-logo {
		text-align: center;
		margin-bottom: 30px;
	}

	.logo-badge {
		width: auto;
		height: 132px;
		margin: 0 auto 18px;
		display: block;
		filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.45));
	}

	.auth-logo h1 {
		margin: 0 0 8px;
		font-size: 1.85rem;
		font-weight: 800;
		letter-spacing: 0;
		color: var(--text);
	}

	.auth-logo p {
		margin: 0;
		color: var(--text-muted);
		font-size: 0.95rem;
		line-height: 1.4;
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
		background: rgba(var(--bad-rgb, 220, 80, 80), 0.18);
		border: 1px solid var(--bad);
		color: var(--bad);
	}

	.success-banner {
		background: color-mix(in srgb, var(--good) 18%, transparent);
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
		margin-bottom: 20px;
	}

	.form-field label {
		display: block;
		font-size: 0.85rem;
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
		box-sizing: border-box;
		transition:
			border-color 0.18s,
			box-shadow 0.18s,
			background 0.18s;
	}

	.form-field input::placeholder {
		color: var(--text-muted);
		opacity: 0.6;
	}

	.form-field input:focus {
		outline: none;
		background: var(--surface);
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
	}

	/* ---- Submit button ---- */
	.submit-btn {
		width: 100%;
		min-height: var(--touch);
		margin-top: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-size: 1.05rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 8px 20px -8px color-mix(in srgb, var(--accent) 60%, transparent);
		transition:
			transform 0.15s,
			box-shadow 0.15s,
			opacity 0.15s;
	}

	.submit-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 12px 26px -8px color-mix(in srgb, var(--accent) 70%, transparent);
	}

	.submit-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.submit-btn:disabled {
		opacity: 0.6;
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

	.forgot-link {
		text-align: center;
		margin-top: 14px;
	}

	.link-subtle {
		color: var(--text-muted);
		font-size: 0.88rem;
		text-decoration: none;
		transition: color 0.18s;
	}

	.link-subtle:hover {
		color: var(--text);
		text-decoration: underline;
	}

	.dev-btn {
		width: 100%;
		min-height: var(--touch);
		margin-top: 14px;
		background: transparent;
		color: var(--text);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition:
			color 0.15s,
			border-color 0.15s,
			background 0.15s;
	}

	.dev-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--border);
		background: var(--surface-hover);
	}

	.dev-btn:disabled {
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
		text-decoration: none;
	}

	.link:hover {
		text-decoration: underline;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		color: rgba(255, 255, 255, 0.9);
		font-size: 0.88rem;
		text-decoration: none;
		padding: 9px 16px;
		border-radius: var(--radius-pill);
		background: rgba(24, 31, 37, 0.72);
		border: 1px solid rgba(159, 176, 189, 0.18);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		min-height: var(--touch);
		transition:
			color 0.18s,
			background 0.18s,
			border-color 0.18s;
	}
	.back-link:hover {
		color: rgba(255, 255, 255, 1);
		background: rgba(24, 31, 37, 0.9);
		border-color: rgba(159, 176, 189, 0.35);
	}

	@media (max-width: 480px) {
		.auth-card {
			padding: 32px 22px 26px;
		}
		.auth-logo h1 {
			font-size: 1.6rem;
		}
	}
</style>

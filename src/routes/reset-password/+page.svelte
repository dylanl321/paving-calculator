<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { config } from '$lib/config';
	import { toastStore } from '$lib/stores/toast';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	const token = $page.url.searchParams.get('token') || '';

	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			toastStore.error(error);
			return;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters';
			toastStore.error(error);
			return;
		}

		loading = true;

		try {
			const response = await fetch('/api/auth/reset-password', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ token, password })
			});

			const data = await response.json();

			if (!response.ok) {
				error = data.error || 'Something went wrong';
				toastStore.error(error);
				loading = false;
				return;
			}

			toastStore.success('Password reset successfully');
			goto('/login?reset=success');
		} catch (err) {
			error = 'Network error. Please try again.';
			toastStore.error(error);
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Reset password — {config.app.name}</title>
</svelte:head>

<div class="auth-page">
	<div class="road" aria-hidden="true">
		<svg class="road-svg" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
			<defs>
				<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#1a232b" />
					<stop offset="100%" stop-color="#33424e" />
				</linearGradient>
				<linearGradient id="roadFace" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0%" stop-color="#3a4956" />
					<stop offset="18%" stop-color="#2e3b46" />
					<stop offset="100%" stop-color="#1b232a" />
				</linearGradient>
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
				<radialGradient id="horizonGlow" cx="50%" cy="30%" r="42%">
					<stop offset="0%" stop-color="#5a6f7e" stop-opacity="0.55" />
					<stop offset="100%" stop-color="#5a6f7e" stop-opacity="0" />
				</radialGradient>
			</defs>
			<rect width="1000" height="1000" fill="url(#sky)" />
			<rect width="1000" height="1000" fill="url(#horizonGlow)" />
			<polygon points="500,300 910,1000 90,1000" fill="url(#roadFace)" />
			<polygon points="500,300 104,1000 86,1000" fill="url(#edgeFade)" />
			<polygon points="500,300 914,1000 896,1000" fill="url(#edgeFade)" />
			<g fill="url(#paintFade)">
				<polygon points="497.7,346 502.3,346 502.8,378 497.2,378" />
				<polygon points="496.6,408 503.4,408 504.1,452 495.9,452" />
				<polygon points="494.9,498 505.1,498 506.2,562 493.8,562" />
				<polygon points="492.4,628 507.6,628 509.3,720 490.7,720" />
				<polygon points="488.7,816 511.3,816 514.0,952 486.0,952" />
			</g>
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
				<h1>Reset password</h1>
				<p>Choose a new password for your account.</p>
			</div>

			<form onsubmit={handleSubmit}>
				<div class="form-field">
					<label for="password">New password</label>
					<input
						type="password"
						id="password"
						bind:value={password}
						required
						autocomplete="new-password"
						placeholder="••••••••"
					/>
				</div>

				<div class="form-field">
					<label for="confirm-password">Confirm password</label>
					<input
						type="password"
						id="confirm-password"
						bind:value={confirmPassword}
						required
						autocomplete="new-password"
						placeholder="••••••••"
					/>
				</div>

				{#if error}
					<div class="error-message">{error}</div>
				{/if}

				<button type="submit" class="submit-btn" disabled={loading || !token}>
					{loading ? 'Resetting…' : 'Reset Password'}
				</button>
			</form>

			{#if !token}
				<div class="error-message">Invalid reset link. Please request a new one.</div>
			{/if}

			<div class="auth-footer">
				Remember your password? <a href="/login" class="link">Sign in</a>
			</div>
		</div>

		<a href="/" class="back-link">
			<svg
				width="16"
				height="16"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M19 12H5M12 19l-7-7 7-7" />
			</svg>
			Back to home
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
	.road-vignette {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(120% 90% at 50% 58%, rgba(15, 20, 24, 0) 38%, rgba(15, 20, 24, 0.72) 100%),
			linear-gradient(180deg, rgba(15, 20, 24, 0.35) 0%, rgba(15, 20, 24, 0) 26%);
	}

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
		color: #f4f6f7;
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: 0.2px;
		text-decoration: none;
	}
	.brand-mark {
		width: 30px;
		height: 30px;
		display: block;
		object-fit: contain;
	}

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
		background: rgba(24, 31, 37, 0.72);
		border: 1px solid rgba(159, 176, 189, 0.18);
		backdrop-filter: blur(18px) saturate(120%);
		-webkit-backdrop-filter: blur(18px) saturate(120%);
		box-shadow:
			0 28px 70px -28px rgba(0, 0, 0, 0.8),
			inset 0 1px 0 rgba(255, 255, 255, 0.06);
	}

	.auth-logo {
		text-align: center;
		margin-bottom: 30px;
	}

	.auth-logo h1 {
		margin: 0 0 8px;
		font-size: 1.85rem;
		font-weight: 800;
		letter-spacing: 0.2px;
		color: #f4f6f7;
	}

	.auth-logo p {
		margin: 0;
		color: #9fb0bd;
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.form-field {
		margin-bottom: 20px;
	}

	.form-field label {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 8px;
		color: #cdd8e0;
	}

	.form-field input {
		width: 100%;
		min-height: var(--touch);
		padding: 0 16px;
		background: rgba(15, 20, 24, 0.55);
		border: 1px solid rgba(159, 176, 189, 0.22);
		border-radius: var(--radius);
		color: #f4f6f7;
		font-size: 1rem;
		transition:
			border-color 0.18s,
			box-shadow 0.18s,
			background 0.18s;
	}

	.form-field input::placeholder {
		color: #7e8f9c;
	}

	.form-field input:focus {
		outline: none;
		background: rgba(15, 20, 24, 0.75);
		border-color: #f2c037;
		box-shadow: 0 0 0 3px rgba(242, 192, 55, 0.22);
	}

	.error-message {
		padding: 12px 16px;
		background: rgba(216, 88, 79, 0.18);
		border: 1px solid #d8584f;
		border-radius: var(--radius);
		color: #f3b3ae;
		font-size: 0.9rem;
		margin-bottom: 20px;
	}

	.submit-btn {
		width: 100%;
		min-height: var(--touch);
		margin-top: 4px;
		background: #f2c037;
		color: #1b2228;
		border: none;
		border-radius: var(--radius);
		font-size: 1.05rem;
		font-weight: 700;
		cursor: pointer;
		box-shadow: 0 8px 20px -8px rgba(242, 192, 55, 0.6);
		transition:
			transform 0.15s,
			box-shadow 0.15s,
			opacity 0.15s;
	}

	.submit-btn:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 12px 26px -8px rgba(242, 192, 55, 0.7);
	}

	.submit-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.submit-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.auth-footer {
		margin-top: 24px;
		text-align: center;
		font-size: 0.9rem;
		color: #9fb0bd;
	}

	.link {
		color: #f2c037;
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
		color: #cdd8e0;
		font-size: 0.88rem;
		text-decoration: none;
		padding: 9px 16px;
		border-radius: var(--radius-pill);
		background: rgba(24, 31, 37, 0.72);
		border: 1px solid rgba(159, 176, 189, 0.18);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		transition:
			color 0.18s,
			background 0.18s,
			border-color 0.18s;
	}
	.back-link:hover {
		color: #f4f6f7;
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

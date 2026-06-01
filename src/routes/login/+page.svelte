<script lang="ts">
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth.svelte';
	import { config } from '$lib/config';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		loading = true;

		const result = await authStore.login(email, password);

		if (result.error) {
			error = result.error;
			loading = false;
		} else {
			goto('/dashboard');
		}
	}
</script>

<svelte:head>
	<title>Login — {config.app.name}</title>
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
			<!-- Road scene baked into the card: asphalt with a straight dashed centre lane -->
			<svg class="card-scene" viewBox="0 0 400 560" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
				<!-- Asphalt fills the whole card -->
				<rect width="400" height="560" fill="#2e3b46" />
				<!-- Trapezoid road receding to a vanishing point at top centre -->
				<polygon class="road-surface" points="150,0 250,0 360,560 40,560" />
				<!-- Single straight centre lane, dashes evenly spaced + tapering with perspective -->
				<g class="lane">
					<polygon points="196,30 204,30 205,60 195,60" />
					<polygon points="194,100 206,100 208,140 192,140" />
					<polygon points="191,190 209,190 212,242 188,242" />
					<polygon points="187,300 213,300 217,366 183,366" />
					<polygon points="182,432 218,432 223,512 177,512" />
				</g>
				<!-- Hex pavers tucked into the bottom-left shoulder -->
				<g class="pavers">
					<polygon points="34,470 48,462 62,470 62,486 48,494 34,486" />
					<polygon points="68,470 82,462 96,470 96,486 82,494 68,486" />
					<polygon points="51,500 65,492 79,500 79,516 65,524 51,516" />
					<polygon points="85,500 99,492 113,500 113,516 99,524 85,516" />
					<polygon points="34,530 48,522 62,530 62,546 48,554 34,546" />
				</g>
			</svg>

			<div class="auth-content">
				<div class="auth-logo">
					<div class="logo-badge">
						<img src="/icons/icon-192.png" alt="Paverate" />
					</div>
					<h1>Welcome back</h1>
					<p>Sign in to access your job sites</p>
				</div>

				<form onsubmit={handleSubmit}>
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
							autocomplete="current-password"
							placeholder="••••••••"
						/>
					</div>

					{#if error}
						<div class="error-message">{error}</div>
					{/if}

					<button type="submit" class="submit-btn" disabled={loading}>
						{loading ? 'Signing in...' : 'Sign In'}
					</button>
				</form>

				<div class="auth-footer">
					Don't have an account? <a href="/register" class="link">Register</a>
				</div>
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
		padding: 20px 16px 48px;
	}

	.auth-card {
		position: relative;
		width: 100%;
		max-width: 480px;
		border-radius: 20px;
		overflow: hidden;
		border: 1px solid #37444f;
		box-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.65);
		isolation: isolate;
	}

	/* Road scene baked into the card background */
	.card-scene {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		z-index: 0;
	}

	.card-scene .road-surface {
		fill: color-mix(in srgb, #2e3b46 80%, #000);
	}

	.card-scene .lane polygon {
		fill: #f2c037;
	}

	.card-scene .pavers polygon {
		fill: none;
		stroke: rgba(159, 176, 189, 0.45);
		stroke-width: 3;
		stroke-linejoin: round;
	}

	/* Light readability scrim — keeps asphalt + bright lane visible */
	.auth-content {
		position: relative;
		z-index: 1;
		padding: 44px 32px 36px;
		background: radial-gradient(
			140% 80% at 50% 42%,
			rgba(27, 34, 40, 0.74) 0%,
			rgba(27, 34, 40, 0.32) 100%
		);
	}

	.auth-logo {
		text-align: center;
		margin-bottom: 32px;
	}

	.logo-badge {
		width: 88px;
		height: 88px;
		margin: 0 auto 18px;
		border-radius: 20px;
		background: #1b2228;
		border: 3px solid #f2c037;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		box-shadow: 0 8px 24px -6px rgba(0, 0, 0, 0.6);
	}

	.logo-badge img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.auth-logo h1 {
		margin: 0 0 8px;
		font-size: 1.7rem;
		letter-spacing: 0.3px;
		color: #f4f6f7;
	}

	.auth-logo p {
		margin: 0;
		color: #9fb0bd;
		font-size: 0.95rem;
	}

	.form-field {
		margin-bottom: 22px;
	}

	.form-field label {
		display: block;
		font-size: 0.9rem;
		font-weight: 600;
		margin-bottom: 8px;
		color: #f4f6f7;
	}

	.form-field input {
		width: 100%;
		min-height: var(--touch);
		padding: 0 16px;
		background: rgba(27, 34, 40, 0.7);
		border: 1px solid #37444f;
		border-radius: var(--radius);
		color: #f4f6f7;
		font-size: 1rem;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}

	.form-field input::placeholder {
		color: #9fb0bd;
	}

	.form-field input:focus {
		outline: none;
		border-color: #f2c037;
		box-shadow: 0 0 0 3px rgba(242, 192, 55, 0.25);
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
		background: #f2c037;
		color: #1b2228;
		border: none;
		border-radius: var(--radius);
		font-size: 1.05rem;
		font-weight: 700;
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
		color: #9fb0bd;
	}

	.link {
		color: #f2c037;
		font-weight: 600;
	}

	.link:hover {
		text-decoration: underline;
	}
</style>

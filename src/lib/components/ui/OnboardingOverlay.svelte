<script lang="ts">
	import { onMount } from 'svelte';
	import { showOnboarding } from '$lib/stores/onboarding';
	import { authStore } from '$lib/stores/auth.svelte';
	import { fade } from 'svelte/transition';

	const STORAGE_KEY = 'paverate_onboarding_done';

	let currentStep = $state(0);

	const steps = [
		{
			icon: '⚙️',
			title: 'Set up your job site',
			description:
				'Configure your location, road width, lift thickness, and course type. These settings apply to all calculators and ensure accurate results for your specific project.'
		},
		{
			icon: '🧮',
			title: 'Pick your calculator',
			description:
				'Choose from Spread Rate, Feet Left, Tack Rate, Tonnage, and more. Each calculator uses your job settings to give instant answers tailored to your current paving operation.'
		},
		{
			icon: '📋',
			title: 'Log your results',
			description:
				'Save your calculations to the activity log for your records. Track what you have placed, how much material was used, and reference it later for QC or reporting.'
		}
	];

	function next() {
		if (currentStep < steps.length - 1) {
			currentStep++;
		} else {
			complete();
		}
	}

	function back() {
		if (currentStep > 0) {
			currentStep--;
		}
	}

	function skip() {
		complete();
	}

	function complete() {
		localStorage.setItem(STORAGE_KEY, 'true');
		showOnboarding.set(false);
	}

	onMount(() => {
		const done = localStorage.getItem(STORAGE_KEY);
		if (!done && authStore.isAuthenticated) {
			showOnboarding.set(true);
		}
	});

	$effect(() => {
		if ($showOnboarding) {
			currentStep = 0;
		}
	});
</script>

{#if $showOnboarding}
	<div class="overlay" transition:fade={{ duration: 200 }}>
		<div class="backdrop"></div>
		<div class="card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
			<div class="step-content">
				<div class="step-icon">{steps[currentStep].icon}</div>
				<h2 id="onboarding-title" class="step-title">{steps[currentStep].title}</h2>
				<p class="step-description">{steps[currentStep].description}</p>
			</div>

			<div class="step-dots">
				{#each steps as _, i}
					<button
						class="dot"
						class:active={i === currentStep}
						onclick={() => (currentStep = i)}
						aria-label="Go to step {i + 1}"
						aria-current={i === currentStep ? 'step' : undefined}
					></button>
				{/each}
			</div>

			<div class="actions">
				{#if currentStep > 0}
					<button class="btn btn-secondary" onclick={back}>Back</button>
				{:else}
					<button class="btn btn-secondary" onclick={skip}>Skip</button>
				{/if}
				<button class="btn btn-primary" onclick={next}>
					{currentStep < steps.length - 1 ? 'Next' : 'Get Started'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}

	.backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
	}

	.card {
		position: relative;
		z-index: 1;
		width: 100%;
		max-width: 480px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		padding: 32px 24px 24px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
		animation: slideUp 0.3s ease;
	}

	@keyframes slideUp {
		from {
			opacity: 0;
			transform: translateY(24px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.step-content {
		text-align: center;
		margin-bottom: 32px;
	}

	.step-icon {
		font-size: 3rem;
		margin-bottom: 16px;
	}

	.step-title {
		font-size: var(--fs-xl, 1.5rem);
		font-weight: var(--fw-bold, 700);
		color: var(--text);
		margin-bottom: 12px;
	}

	.step-description {
		font-size: var(--fs-md, 1rem);
		line-height: 1.5;
		color: var(--text-muted);
	}

	.step-dots {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		margin-bottom: 24px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--border);
		border: none;
		padding: 0;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.dot.active {
		background: var(--accent);
		width: 24px;
		border-radius: 4px;
	}

	.actions {
		display: flex;
		gap: 12px;
	}

	.btn {
		flex: 1;
		min-height: 48px;
		padding: 0 20px;
		border-radius: var(--radius-sm, 8px);
		font-size: var(--fs-md, 1rem);
		font-weight: var(--fw-semibold, 600);
		cursor: pointer;
		transition: all 0.15s ease;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.btn-primary {
		background: var(--accent);
		color: var(--accent-text);
	}

	.btn-primary:hover {
		opacity: 0.9;
	}

	.btn-primary:active {
		transform: scale(0.98);
	}

	.btn-secondary {
		background: transparent;
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.btn-secondary:hover {
		background: var(--surface-hover);
		color: var(--text);
	}

	.btn-secondary:active {
		transform: scale(0.98);
	}

	@media (max-width: 460px) {
		.card {
			padding: 24px 20px 20px;
		}

		.step-icon {
			font-size: 2.5rem;
		}

		.step-title {
			font-size: var(--fs-lg, 1.25rem);
		}

		.step-description {
			font-size: var(--fs-sm, 0.875rem);
		}
	}
</style>

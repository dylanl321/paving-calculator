<script lang="ts">
	import { config } from '$lib/config';

	interface GuideStep {
		number: number;
		title: string;
		description: string;
		tipText: string;
		actionLabel: string;
		actionHref: string;
		icon: 'sunrise' | 'truck' | 'road' | 'pause' | 'checkmark';
	}

	const steps: GuideStep[] = [
		{
			number: 1,
			title: 'Morning Prep',
			description: 'Check weather, confirm paving window, set crew count',
			tipText: 'Confirm your mix design and tonnage target before the first truck rolls.',
			actionLabel: 'Check Weather',
			actionHref: '/dashboard',
			icon: 'sunrise'
		},
		{
			number: 2,
			title: 'First Load',
			description: 'Log truck ticket, confirm mix type and tons',
			tipText: 'Verify the ticket weight matches your order. Reject loads more than 5% over or under.',
			actionLabel: 'Log First Load',
			actionHref: '/app',
			icon: 'truck'
		},
		{
			number: 3,
			title: 'During Paving',
			description: 'Log loads as they arrive, track stations',
			tipText: 'Log every load before the truck leaves the site. GPS station logging keeps your spread rate accurate.',
			actionLabel: 'Open Load Tracker',
			actionHref: '/app',
			icon: 'road'
		},
		{
			number: 4,
			title: 'Breaks and Delays',
			description: 'Log any stoppages with reason codes',
			tipText: 'Delays over 30 minutes can affect mat temperature. Document the reason for your records.',
			actionLabel: 'Log Delay',
			actionHref: '/app',
			icon: 'pause'
		},
		{
			number: 5,
			title: 'End of Day',
			description: 'Review your summary, close out the job, generate PDF report',
			tipText: 'Close out only after all loads are logged. The PDF report is your ticket for billing.',
			actionLabel: 'View Day Summary',
			actionHref: '/app',
			icon: 'checkmark'
		}
	];
</script>

<svelte:head>
	<title>How to Run a Paving Day — {config.app.name}</title>
</svelte:head>

<div class="guide-page">
	<div class="page-header">
		<a href="/dashboard/guides" class="back-link">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
			Back to Guides
		</a>
		<h2 class="page-title">How to Run a Paving Day</h2>
		<p class="page-subtitle">Follow these {steps.length} steps from morning prep to end-of-day closeout</p>
	</div>

	<div class="steps-list">
		{#each steps as step}
			<div class="step-card">
				<div class="step-badge">{step.number}</div>

				<div class="step-content">
					<div class="step-header">
						<div class="step-icon" aria-hidden="true">
							{#if step.icon === 'sunrise'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="12" cy="12" r="4"></circle>
									<path d="M12 2v2"></path>
									<path d="M12 20v2"></path>
									<path d="m4.93 4.93 1.41 1.41"></path>
									<path d="m17.66 17.66 1.41 1.41"></path>
									<path d="M2 12h2"></path>
									<path d="M20 12h2"></path>
									<path d="m6.34 17.66-1.41 1.41"></path>
									<path d="m19.07 4.93-1.41 1.41"></path>
								</svg>
							{:else if step.icon === 'truck'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
									<path d="M15 18H9"></path>
									<path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path>
									<circle cx="17" cy="18" r="2"></circle>
									<circle cx="7" cy="18" r="2"></circle>
								</svg>
							{:else if step.icon === 'road'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="12" cy="10" r="3"></circle>
									<path d="M12 21.7C17.3 17 20 13 20 10a8 8 0 1 0-16 0c0 3 2.7 6.9 8 11.7z"></path>
								</svg>
							{:else if step.icon === 'pause'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<circle cx="12" cy="12" r="10"></circle>
									<polyline points="12 6 12 12 16 14"></polyline>
								</svg>
							{:else if step.icon === 'checkmark'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M20 6 9 17l-5-5"></path>
									<path d="M22 10V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h12"></path>
								</svg>
							{/if}
						</div>

						<div class="step-text">
							<h3 class="step-title">{step.title}</h3>
							<p class="step-description">{step.description}</p>
						</div>
					</div>

					<div class="step-tip">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<circle cx="12" cy="12" r="10"></circle>
							<path d="M12 16v-4"></path>
							<path d="M12 8h.01"></path>
						</svg>
						{step.tipText}
					</div>

					<a href={step.actionHref} class="step-action">
						{step.actionLabel}
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
							<polyline points="9 18 15 12 9 6"></polyline>
						</svg>
					</a>
				</div>
			</div>
		{/each}
	</div>
</div>

<style>
	.guide-page {
		width: 100%;
		max-width: 900px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 32px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		margin-bottom: 16px;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.9rem;
		font-weight: 600;
		transition: color 0.2s;
		min-height: 48px;
		padding: 12px 0;
	}

	.back-link:hover {
		color: var(--text);
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 8px;
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-muted);
	}

	.steps-list {
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.step-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 24px;
		display: flex;
		gap: 20px;
		position: relative;
	}

	.step-badge {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-text);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		font-weight: 800;
	}

	.step-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.step-header {
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}

	.step-icon {
		flex-shrink: 0;
		width: 40px;
		height: 40px;
		color: var(--accent);
	}

	.step-text {
		flex: 1;
	}

	.step-title {
		margin: 0 0 6px;
		font-size: 1.25rem;
		line-height: 1.2;
		color: var(--text);
	}

	.step-description {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.step-tip {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 12px 16px;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.875rem;
		color: var(--text-muted);
		line-height: 1.5;
	}

	.step-tip svg {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.step-action {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 24px;
		background: var(--accent);
		color: var(--accent-text);
		text-decoration: none;
		font-size: 0.95rem;
		font-weight: 600;
		border-radius: var(--radius);
		transition: opacity 0.2s;
		align-self: flex-start;
	}

	.step-action:hover {
		opacity: 0.9;
	}

	@media (max-width: 767px) {
		.step-card {
			flex-direction: column;
			padding: 20px;
		}

		.step-badge {
			align-self: flex-start;
		}

		.step-header {
			flex-direction: column;
		}

		.step-icon {
			align-self: flex-start;
		}

		.step-action {
			width: 100%;
		}
	}
</style>

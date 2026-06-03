<script lang="ts">
	import { config } from '$lib/config';

	interface GuideStep {
		number: number;
		title: string;
		description: string;
		whyText: string;
		actionLabel: string;
		actionHref: string;
		icon: 'building' | 'map' | 'settings' | 'calendar' | 'users' | 'clipboard';
	}

	const steps: GuideStep[] = [
		{
			number: 1,
			title: 'Create Job Site',
			description: 'Enter the job site name, address, contract number, and contact info for the owner and general contractor. This creates the record where all your project data lives.',
			whyText: 'All load tickets, photos, and daily reports are tied to the job site. Without it, nothing gets logged to the right contract.',
			actionLabel: 'Create Job Site',
			actionHref: '/dashboard/jobs/new',
			icon: 'building'
		},
		{
			number: 2,
			title: 'Draw Route Alignment',
			description: 'Sketch the paving path on the map so the app knows your station locations. Draw the centerline from start to finish, marking station 0+00 at your starting point.',
			whyText: 'GPS station logging only works if the app knows where your route is. Without a route, your tonnage spread rates will be inaccurate.',
			actionLabel: 'Open Map Editor',
			actionHref: '/dashboard',
			icon: 'map'
		},
		{
			number: 3,
			title: 'Configure Road Settings',
			description: 'Set the road width, number of lanes, and lift plan (base/binder/surface). Enter your total tonnage estimate so the app can calculate your spread rate targets.',
			whyText: 'The app calculates your spread rate from these settings. Get them right upfront so your crew has accurate targets all season.',
			actionLabel: 'Open Settings',
			actionHref: '/dashboard',
			icon: 'settings'
		},
		{
			number: 4,
			title: 'Set Project Milestones',
			description: 'Enter the project start date, key phase dates, and completion target. These deadlines are visible to your whole crew so everyone knows what is due when.',
			whyText: 'Crew coordination depends on clear deadlines. Missed milestones can trigger liquidated damages, so track them from day one.',
			actionLabel: 'Set Milestones',
			actionHref: '/dashboard',
			icon: 'calendar'
		},
		{
			number: 5,
			title: 'Invite Crew Members',
			description: 'Add crew members and assign their roles: foreman, operator, or laborer. Each crew member gets access to the job site data based on their role.',
			whyText: 'Role-based access keeps your data secure and gives each crew member exactly the tools they need for their job.',
			actionLabel: 'Manage Crew',
			actionHref: '/dashboard/crew',
			icon: 'users'
		},
		{
			number: 6,
			title: 'First Day Checklist',
			description: 'Verify your equipment list, confirm plant contact info, and set your default mix design. This checklist ensures nothing is forgotten before the first truck rolls.',
			whyText: 'A missing phone number or wrong mix design on day one can delay paving for hours. Run this checklist the night before you start.',
			actionLabel: 'View Checklist',
			actionHref: '/dashboard',
			icon: 'clipboard'
		}
	];
</script>

<svelte:head>
	<title>Setting Up a New Project — {config.app.name}</title>
</svelte:head>

<div class="guide-page">
	<div class="page-header">
		<a href="/dashboard/guides" class="back-link">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
			Back to Guides
		</a>
		<h2 class="page-title">Setting Up a New Project</h2>
		<p class="page-subtitle">Follow these {steps.length} steps to configure your job site from scratch</p>
	</div>

	<div class="steps-list">
		{#each steps as step}
			<div class="step-card">
				<div class="step-badge">{step.number}</div>

				<div class="step-content">
					<div class="step-header">
						<div class="step-icon" aria-hidden="true">
							{#if step.icon === 'building'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
									<path d="M9 22v-4h6v4"></path>
									<path d="M8 6h.01"></path>
									<path d="M16 6h.01"></path>
									<path d="M12 6h.01"></path>
									<path d="M12 10h.01"></path>
									<path d="M12 14h.01"></path>
									<path d="M16 10h.01"></path>
									<path d="M16 14h.01"></path>
									<path d="M8 10h.01"></path>
									<path d="M8 14h.01"></path>
								</svg>
							{:else if step.icon === 'map'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M3 11l19-9-9 19-2-8-8-2z"></path>
								</svg>
							{:else if step.icon === 'settings'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<line x1="4" y1="21" x2="4" y2="14"></line>
									<line x1="4" y1="10" x2="4" y2="3"></line>
									<line x1="12" y1="21" x2="12" y2="12"></line>
									<line x1="12" y1="8" x2="12" y2="3"></line>
									<line x1="20" y1="21" x2="20" y2="16"></line>
									<line x1="20" y1="12" x2="20" y2="3"></line>
									<line x1="1" y1="14" x2="7" y2="14"></line>
									<line x1="9" y1="8" x2="15" y2="8"></line>
									<line x1="17" y1="16" x2="23" y2="16"></line>
								</svg>
							{:else if step.icon === 'calendar'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
									<line x1="16" y1="2" x2="16" y2="6"></line>
									<line x1="8" y1="2" x2="8" y2="6"></line>
									<line x1="3" y1="10" x2="21" y2="10"></line>
								</svg>
							{:else if step.icon === 'users'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
									<circle cx="9" cy="7" r="4"></circle>
									<path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
									<path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
								</svg>
							{:else if step.icon === 'clipboard'}
								<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
									<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"></path>
									<rect x="9" y="3" width="6" height="4" rx="2" ry="2"></rect>
									<path d="M9 14l2 2 4-4"></path>
								</svg>
							{/if}
						</div>

						<div class="step-text">
							<h3 class="step-title">{step.title}</h3>
							<p class="step-description">{step.description}</p>
						</div>
					</div>

					<details class="step-why">
						<summary>Why this matters</summary>
						<p>{step.whyText}</p>
					</details>

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

	.step-why {
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
	}

	.step-why summary {
		padding: 12px 16px;
		cursor: pointer;
		font-weight: 600;
		color: var(--text-muted);
		list-style: none;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		user-select: none;
	}

	.step-why summary::-webkit-details-marker {
		display: none;
	}

	.step-why summary::before {
		content: '\25B6';
		font-size: 0.75rem;
		transition: transform 0.2s;
	}

	.step-why[open] summary::before {
		transform: rotate(90deg);
	}

	.step-why p {
		margin: 0;
		padding: 0 16px 12px;
		color: var(--text-muted);
		font-size: 0.875rem;
		line-height: 1.5;
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

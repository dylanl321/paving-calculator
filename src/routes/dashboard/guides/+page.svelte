<script lang="ts">
	import { config } from '$lib/config';

	interface Guide {
		slug: string;
		title: string;
		description: string;
		stepCount: number;
	}

	const guides: Guide[] = [
		{
			slug: 'paving-day',
			title: 'How to Run a Paving Day',
			description: 'Complete workflow from morning prep through end-of-day closeout. Track loads, log delays, and generate your daily report.',
			stepCount: 5
		},
		{
			slug: 'new-project',
			title: 'Setting Up a New Project',
			description: 'Configure your job site from scratch: contract info, route map, road settings, milestones, crew, and first-day checklist.',
			stepCount: 6
		}
	];
</script>

<svelte:head>
	<title>Guides — {config.app.name}</title>
</svelte:head>

<div class="guides-page">
	<div class="page-header">
		<div>
			<h2 class="page-title">Guides</h2>
			<p class="page-subtitle">Step-by-step workflows for your crew</p>
		</div>
	</div>

	<div class="guides-grid">
		{#each guides as guide}
			<a href="/dashboard/guides/{guide.slug}" class="guide-card">
				<div class="guide-header">
					<h3 class="guide-title">{guide.title}</h3>
					<span class="step-count">{guide.stepCount} steps</span>
				</div>
				<p class="guide-description">{guide.description}</p>
				<div class="guide-footer">
					<span class="guide-cta">Start guide →</span>
				</div>
			</a>
		{/each}
	</div>
</div>

<style>
	.guides-page {
		width: 100%;
	}

	.page-header {
		margin-bottom: 24px;
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 4px;
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.guides-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 16px;
	}

	.guide-card {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		text-decoration: none;
		transition: all 0.2s;
		min-height: 48px;
	}

	.guide-card:hover {
		border-color: var(--accent);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.guide-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.guide-title {
		margin: 0;
		font-size: 1.2rem;
		line-height: 1.3;
		color: var(--text);
	}

	.step-count {
		padding: 4px 10px;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		white-space: nowrap;
		background: var(--accent);
		color: var(--accent-text);
	}

	.guide-description {
		margin: 0;
		font-size: 0.95rem;
		color: var(--text-muted);
		line-height: 1.5;
		flex: 1;
	}

	.guide-footer {
		display: flex;
		justify-content: flex-end;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}

	.guide-cta {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--accent);
	}

	@media (max-width: 767px) {
		.guides-grid {
			grid-template-columns: 1fr;
		}
	}
</style>

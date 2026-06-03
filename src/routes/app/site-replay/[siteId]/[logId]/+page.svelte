<script lang="ts">
	import { config } from '$lib/config';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const formattedDate = $derived.by(() => {
		try {
			const date = new Date(data.log.log_date);
			return date.toLocaleDateString('en-US', {
				weekday: 'long',
				year: 'numeric',
				month: 'long',
				day: 'numeric'
			});
		} catch {
			return data.log.log_date;
		}
	});
</script>

<svelte:head>
	<title>Daily Progress Replay - {data.site.name} - {config.app.name}</title>
</svelte:head>

<div class="replay-page">
	<div class="page-header">
		<a href="/dashboard/job-sites/{data.site.id}" class="back-link">
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<polyline points="15 18 9 12 15 6"></polyline>
			</svg>
			Back to {data.site.name}
		</a>

		<div class="page-title-group">
			<h1 class="page-title">Daily Progress Replay</h1>
			<p class="page-subtitle">{formattedDate}</p>
		</div>
	</div>

	{#await import('$lib/components/DailyProgressReplay.svelte')}
		<div class="loading-state">Loading replay&hellip;</div>
	{:then { default: DailyProgressReplay }}
		<DailyProgressReplay
			site={{
				id: data.site.id,
				name: data.site.name,
				latitude: data.site.latitude,
				longitude: data.site.longitude
			}}
			waypoints={data.waypoints}
			logId={data.log.id}
			logDate={data.log.log_date}
			height="520px"
		/>
	{/await}
</div>

<style>
	.replay-page {
		max-width: 1200px;
		margin: 0 auto;
		padding: 20px;
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin-bottom: 24px;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 0.9rem;
		color: var(--text-muted);
		text-decoration: none;
		transition: color 0.2s;
		width: fit-content;
	}

	.back-link:hover {
		color: var(--accent);
	}

	.page-title-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.page-title {
		margin: 0;
		font-size: 1.75rem;
		font-weight: 700;
		color: var(--text);
	}

	.page-subtitle {
		margin: 0;
		font-size: 1rem;
		color: var(--text-muted);
	}

	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 60px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	@media (max-width: 640px) {
		.replay-page {
			padding: 16px;
		}

		.page-title {
			font-size: 1.5rem;
		}

		.page-subtitle {
			font-size: 0.9rem;
		}
	}
</style>

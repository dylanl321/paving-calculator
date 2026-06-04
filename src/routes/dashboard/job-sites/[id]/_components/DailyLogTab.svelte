<script lang="ts">
	let { jobSiteId }: { jobSiteId: string } = $props();
</script>

<section class="section daily-log-layout">
	<div class="daily-log-main">
		<div class="empty-state">
			<svg
				width="48"
				height="48"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
				<polyline points="14 2 14 8 20 8"></polyline>
				<line x1="16" y1="13" x2="8" y2="13"></line>
				<line x1="16" y1="17" x2="8" y2="17"></line>
				<polyline points="10 9 9 9 8 9"></polyline>
			</svg>
			<h4>Recent Activity</h4>
			<p>Your recent log entries will appear here.</p>
			<a class="btn btn-ghost" href="/dashboard/job-sites/{jobSiteId}/log/history">View history</a>
		</div>
	</div>
	<div class="daily-log-sidebar">
		<div class="log-form-panel">
			<h4>Daily Production Log</h4>
			<p>Track tonnage, stations, conditions, and crew for each work day.</p>
			<div class="log-cta">
				<a class="btn-primary" href="/dashboard/job-sites/{jobSiteId}/log">Open today's log</a>
			</div>
		</div>
	</div>
</section>

<style>
	.daily-log-layout {
		display: block;
	}

	.daily-log-main {
		width: 100%;
	}

	.daily-log-sidebar {
		display: none;
	}

	@media (min-width: 1024px) {
		.daily-log-layout {
			display: grid;
			grid-template-columns: 3fr 2fr;
			gap: 20px;
		}

		.daily-log-sidebar {
			display: block;
		}
	}

	.log-form-panel {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
	}

	.log-form-panel h4 {
		margin: 0 0 8px;
		font-size: 1.1rem;
		font-weight: 700;
	}

	.log-form-panel p {
		margin: 0 0 16px;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.log-cta {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-top: 20px;
		flex-wrap: wrap;
	}

	@media (min-width: 1024px) {
		.log-cta {
			justify-content: flex-start;
		}
	}

	.log-cta a {
		text-decoration: none;
	}
</style>

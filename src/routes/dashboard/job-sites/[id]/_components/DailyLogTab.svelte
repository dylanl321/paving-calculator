<script lang="ts">
	let { jobSiteId }: { jobSiteId: string } = $props();
</script>

<section class="section">
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
		<h4>Daily Production Log</h4>
		<p>Track tonnage, stations, conditions, and crew for each work day.</p>
		<div class="log-cta">
			<a class="btn-primary" href="/dashboard/job-sites/{jobSiteId}/log">Open today's log</a>
			<a class="btn btn-ghost" href="/dashboard/job-sites/{jobSiteId}/log/history">View history</a>
		</div>
	</div>
</section>

<style>
	.log-cta {
		display: flex;
		gap: 12px;
		justify-content: center;
		margin-top: 20px;
		flex-wrap: wrap;
	}
	.log-cta a {
		text-decoration: none;
	}
</style>

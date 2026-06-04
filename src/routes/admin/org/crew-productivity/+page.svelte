<script lang="ts">
	import { config } from '$lib/config';
	import CrewProductivityDashboard from '$lib/components/CrewProductivityDashboard.svelte';
</script>

<svelte:head>
	<title>Crew Productivity — {config.app.name} Admin</title>
</svelte:head>

<header class="admin-page-header">
	<div>
		<h1 class="admin-page-title">Crew Productivity</h1>
		<p class="admin-page-subtitle">Output and efficiency across your organization's crews.</p>
	</div>
</header>

<CrewProductivityDashboard />

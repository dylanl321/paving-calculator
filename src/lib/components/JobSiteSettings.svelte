<script lang="ts">
	import { job } from '$lib/stores/job.svelte';
	import { weather } from '$lib/stores/weather.svelte';
	import { spreadRateFromThickness } from '$lib/config/formulas';
	import { machines } from '$lib/config';
	import JobSiteSettingsForm from './JobSiteSettingsForm.svelte';
	import { Settings } from 'lucide-svelte';

	let open = $state(false);

	const rate = $derived(job.thicknessIn > 0 ? Math.round(spreadRateFromThickness(job.thicknessIn)) : 0);
	const machineLabel = $derived(machines.find((m) => m.id === job.machineId)?.label ?? 'None');
	const title = $derived(job.siteName.trim() || 'Job Site Settings');
	const temp = $derived(
		weather.effectiveTempF != null ? `${weather.effectiveTempF}°F` : null
	);
</script>

<!-- Mobile / narrow: collapsible bar in main content. Hidden on tablet+ where the side panel holds settings. -->
<div class="job-site-mobile">
	<button class="summary" onclick={() => (open = !open)} aria-expanded={open}>
		<span class="icon" aria-hidden="true"><Settings size={18} /></span>
		<span class="text">
			<b>{title}</b>
			{#if weather.hasLocation}
				· {weather.locationLabel}
			{/if}
			· {job.widthFt} ft × {job.thicknessIn}" ({rate} lbs/SY) · {machineLabel}
			{#if temp}· {temp}{/if}
		</span>
		<span class="chev">{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		<div class="body">
			<JobSiteSettingsForm variant="inline" />
		</div>
	{/if}
</div>

<style>
	.job-site-mobile {
		position: sticky;
		top: 0;
		z-index: 5;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 16px;
		overflow: hidden;
	}

	.summary {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		background: none;
		border: 0;
		color: var(--text);
		padding: 14px;
		font-size: 0.85rem;
		text-align: left;
		cursor: pointer;
		min-height: var(--touch, 48px);
	}

	.icon {
		color: var(--accent);
		font-size: 1.1rem;
		flex-shrink: 0;
	}

	.text {
		flex: 1;
		color: var(--text-muted);
		line-height: 1.35;
	}

	.text b {
		color: var(--text);
	}

	.chev {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.body {
		padding: 4px 14px 16px;
		border-top: 1px solid var(--border);
		max-height: min(70vh, 640px);
		overflow-y: auto;
	}

	@media (min-width: 768px) {
		.job-site-mobile {
			display: none;
		}
	}
</style>

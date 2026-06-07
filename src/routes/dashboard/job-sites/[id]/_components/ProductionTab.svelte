<!--
	ProductionTab — the "Production" surface. Composes the existing DailyLogTab
	(per-day production history + progress) and CalculationsTab as sections, plus
	a quality-control pointer to the daily-log workspace where live spread-rate /
	nuclear-density QC is recorded. Reuses the underlying tab components as-is.

	Note on QC: the daily quality-control tooling (compliance gauge, nuclear gauge,
	spread-rate checks) lives inside the daily-log workspace, so Production links
	there rather than duplicating it. Imported-spec verification lives under
	Records.
-->
<script lang="ts">
	import type { Calculation } from '../+page';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import DailyLogTab from './DailyLogTab.svelte';
	import CalculationsTab from './CalculationsTab.svelte';

	let {
		jobSiteId,
		calculations,
		onNewCalculation
	}: {
		jobSiteId: string;
		calculations: Calculation[];
		onNewCalculation: () => void;
	} = $props();
</script>

<div class="production-tab">
	<section class="production-tab__group">
		<SectionHeader
			title="Daily Log & Progress"
			subtitle="Per-day production history, tonnage and station progress."
			as="h3"
		>
			{#snippet actions()}
				<Button variant="ghost" size="sm" href="/dashboard/job-sites/{jobSiteId}/log">
					Today's Log
				</Button>
			{/snippet}
		</SectionHeader>
		<DailyLogTab {jobSiteId} />
	</section>

	<section class="production-tab__group">
		<SectionHeader
			title="Quality Control"
			subtitle="Spread-rate compliance and nuclear density are recorded per day."
			as="h3"
		/>
		<Card padding="md">
			<div class="qc-pointer">
				<p>
					Daily quality control — compliance gauge, nuclear density and spread-rate checks —
					is captured inside each day's log as work is placed.
				</p>
				<Button size="sm" href="/dashboard/job-sites/{jobSiteId}/log">
					Open Today's Log
				</Button>
			</div>
		</Card>
	</section>

	<section class="production-tab__group">
		<SectionHeader
			title="Calculations"
			subtitle="Saved field calculations for this project."
			as="h3"
		>
			{#snippet actions()}
				<Button size="sm" onclick={onNewCalculation}>New calculation</Button>
			{/snippet}
		</SectionHeader>
		<CalculationsTab {calculations} {onNewCalculation} />
	</section>
</div>

<style>
	.production-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-8, 40px);
	}

	.production-tab__group {
		min-width: 0;
	}

	.qc-pointer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.qc-pointer p {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.5;
		max-width: 60ch;
		min-width: 0;
	}
</style>

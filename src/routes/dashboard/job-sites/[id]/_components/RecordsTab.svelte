<!--
	RecordsTab — the "Records" surface. Composes the activity/audit history, a
	link to full daily-log history, and the imported-spec verification (the whole
	VerificationTab, which reviews what was pulled from project documents). Reuses
	ActivityTab and VerificationTab as-is. The verification "Edit Configuration"
	actions are repointed to the Plan tab where configuration now lives.
-->
<script lang="ts">
	import type { ConfigForm } from './shared';
	import SectionHeader from '$lib/components/ui/SectionHeader.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import ActivityTab from './ActivityTab.svelte';
	import VerificationTab from './VerificationTab.svelte';

	let {
		jobSiteId,
		configForm,
		onGoToTab
	}: {
		jobSiteId: string;
		configForm: ConfigForm;
		onGoToTab: (tab: string) => void;
	} = $props();
</script>

<div class="records-tab">
	<section class="records-tab__group">
		<SectionHeader
			title="Imported Specifications"
			subtitle="Review what was pulled from the project documents and what still needs validation."
			as="h3"
		/>
		<VerificationTab {jobSiteId} {configForm} {onGoToTab} />
	</section>

	<section class="records-tab__group">
		<SectionHeader
			title="Activity & History"
			subtitle="Audit trail of changes and full daily-log history."
			as="h3"
		>
			{#snippet actions()}
				<Button variant="ghost" size="sm" href="/dashboard/job-sites/{jobSiteId}/log/history">
					Log history
				</Button>
			{/snippet}
		</SectionHeader>
		<ActivityTab {jobSiteId} />
	</section>
</div>

<style>
	.records-tab {
		display: flex;
		flex-direction: column;
		gap: var(--sp-8, 40px);
	}

	.records-tab__group {
		min-width: 0;
	}
</style>

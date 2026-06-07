<!--
	CommandTab — the "Command" hub: the state of the project now plus the single
	clearest next action. Rebuilt on CardGrid so the cards are equal height
	(fixing the old Overview's mismatched panels). Cards: a next-action banner, a
	map preview, key stats (StatTile), contract summary, and production-vs-plan.
	Light data (contract + progress) is fetched here; derived stats are passed in
	from the page so this hub stays a thin, scannable summary rather than a second
	copy of the full detail.
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import type { PageData } from '../$types';
	import type { ConfigForm } from './shared';
	import { fmt, fmtDollars } from './shared';
	import CardGrid from '$lib/components/ui/CardGrid.svelte';
	import Card from '$lib/components/ui/Card.svelte';
	import StatTile from '$lib/components/ui/StatTile.svelte';
	import Button from '$lib/components/ui/Button.svelte';

	let {
		data,
		configForm,
		totalAreaSqYd,
		estTonnage,
		costSummary,
		milestonePct,
		equipmentCount,
		setupScore,
		missingFields = [],
		onGoToTab
	}: {
		data: PageData;
		configForm: ConfigForm;
		totalAreaSqYd: number | null;
		estTonnage: number | null;
		costSummary: { value: number; method: string } | null;
		milestonePct: number | null;
		equipmentCount: number;
		setupScore: number | null;
		missingFields?: string[];
		onGoToTab: (tab: string) => void;
	} = $props();

	const jobSite = $derived(data.jobSite);
	const hasLocation = $derived(jobSite.latitude != null && jobSite.longitude != null);

	interface ProgressData {
		geometry: { type: 'LineString'; coordinates: [number, number][] } | null;
		logEntries: Array<{ tons_placed: number | null }>;
		totalLengthFt: number | null;
	}
	let progressData = $state<ProgressData | null>(null);

	$effect(() => {
		if (!browser) return;
		fetch(`/api/job-sites/${jobSite.id}/progress`)
			.then((res) => (res.ok ? res.json() : null))
			.then((d) => {
				progressData = d as ProgressData | null;
			})
			.catch(() => {
				progressData = null;
			});
	});

	interface ContractInfo {
		project_number: string | null;
		contract_amount: number | null;
		customer_name: string | null;
		completion_date: string | null;
		project_manager: string | null;
	}
	let contract = $state<ContractInfo | null>(null);

	$effect(() => {
		if (!browser) return;
		fetch(`/api/job-sites/${jobSite.id}/bid-items`, { credentials: 'include' })
			.then((res) => (res.ok ? res.json() : {}))
			.then((d: { contract?: ContractInfo }) => {
				contract = d.contract ?? null;
			})
			.catch(() => {
				contract = null;
			});
	});

	const placedTons = $derived(
		progressData?.logEntries?.reduce((sum, e) => sum + (e.tons_placed ?? 0), 0) ?? 0
	);
	const plannedTons = $derived(configForm.total_tonnage ?? estTonnage ?? null);
	const placedPct = $derived(
		plannedTons && plannedTons > 0 ? Math.min(100, Math.round((placedTons / plannedTons) * 100)) : null
	);

	const contractValue = $derived(
		configForm.total_contract_value ?? contract?.contract_amount ?? costSummary?.value ?? null
	);

	// The single clearest next action, derived from project state.
	const nextAction = $derived.by(() => {
		if (!hasLocation) {
			return {
				title: 'Set the project location & route',
				body: 'Drop the project pin and draw the road line so progress can be tracked.',
				label: 'Go to Plan',
				tab: 'plan'
			};
		}
		if (setupScore != null && setupScore < 90) {
			return {
				title: 'Finish project setup',
				body:
					missingFields.length > 0
						? `Still missing: ${missingFields.join(', ')}.`
						: 'Complete the remaining configuration so calculators and targets are accurate.',
				label: 'Go to Plan',
				tab: 'plan'
			};
		}
		return {
			title: "Record today's production",
			body: "Start or continue today's log to capture tonnage, conditions and QC.",
			label: "Today's Log",
			href: `/dashboard/job-sites/${jobSite.id}/log`
		};
	});
</script>

<CardGrid>
	<Card span="full" padding="md">
		<div class="next-action">
			<div class="next-action__text">
				<span class="next-action__kicker">Next action</span>
				<strong>{nextAction.title}</strong>
				<p>{nextAction.body}</p>
			</div>
			<div class="next-action__cta">
				{#if nextAction.href}
					<Button href={nextAction.href}>{nextAction.label}</Button>
				{:else if nextAction.tab}
					<Button onclick={() => onGoToTab(nextAction.tab!)}>{nextAction.label}</Button>
				{/if}
			</div>
		</div>
	</Card>

	{#if hasLocation}
		<Card title="Location" padding="sm" span={2}>
			<div class="cmd-map">
				{#if browser}
					{#await import('$lib/components/JobSiteMap.svelte')}
						<div class="cmd-map__loading">Loading map…</div>
					{:then { default: JobSiteMap }}
						<JobSiteMap
							sites={[
								{
									id: jobSite.id,
									name: jobSite.name,
									status: jobSite.status as 'active' | 'completed' | 'archived',
									latitude: jobSite.latitude,
									longitude: jobSite.longitude,
									location_description: jobSite.location_description
								}
							]}
							height="200px"
						/>
					{/await}
				{/if}
			</div>
			<div class="cmd-map__foot">
				<span>{jobSite.gdot_county ? `${jobSite.gdot_county} County` : 'Location set'}</span>
				<button type="button" class="cmd-link" onclick={() => onGoToTab('plan')}>Open Plan</button>
			</div>
		</Card>
	{/if}

	<Card title="Key Stats" padding="sm">
		<div class="cmd-stats">
			<StatTile label="Total Area" value={totalAreaSqYd ? fmt(totalAreaSqYd) : '—'} unit={totalAreaSqYd ? 'yd²' : undefined} />
			<StatTile label="Est. Tonnage" value={estTonnage ? fmt(estTonnage, 1) : '—'} unit={estTonnage ? 't' : undefined} />
			<StatTile label="Progress" value={milestonePct != null ? milestonePct : '—'} unit={milestonePct != null ? '%' : undefined} />
			<StatTile label="Equipment" value={equipmentCount} accent={equipmentCount > 0} />
		</div>
	</Card>

	<Card title="Contract" padding="sm">
		<dl class="cmd-list">
			<div class="cmd-row">
				<dt>Value</dt>
				<dd>{contractValue != null ? fmtDollars(contractValue) : '—'}</dd>
			</div>
			<div class="cmd-row">
				<dt>Customer</dt>
				<dd>{contract?.customer_name ?? '—'}</dd>
			</div>
			<div class="cmd-row">
				<dt>Project #</dt>
				<dd>{contract?.project_number ?? '—'}</dd>
			</div>
			<div class="cmd-row">
				<dt>Completion</dt>
				<dd>{contract?.completion_date ?? '—'}</dd>
			</div>
		</dl>
	</Card>

	<Card title="Production vs Plan" padding="sm">
		<div class="cmd-prod">
			<div class="cmd-prod__nums">
				<StatTile label="Placed" value={placedTons > 0 ? fmt(placedTons, 1) : '—'} unit={placedTons > 0 ? 't' : undefined} />
				<StatTile label="Planned" value={plannedTons ? fmt(plannedTons, 1) : '—'} unit={plannedTons ? 't' : undefined} />
			</div>
			{#if placedPct != null}
				<div class="cmd-prod__bar" role="img" aria-label="{placedPct}% of planned tonnage placed">
					<div class="cmd-prod__fill" style="width: {placedPct}%"></div>
				</div>
				<span class="cmd-prod__pct">{placedPct}% of plan placed</span>
			{:else}
				<span class="cmd-prod__pct cmd-prod__pct--muted">Set planned tonnage to track progress</span>
			{/if}
		</div>
	</Card>
</CardGrid>

<style>
	.next-action {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		flex-wrap: wrap;
	}

	.next-action__text {
		min-width: 0;
	}

	.next-action__kicker {
		display: block;
		font-size: var(--fs-2xs);
		font-weight: var(--fw-bold);
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--accent);
		margin-bottom: var(--sp-1);
	}

	.next-action__text strong {
		display: block;
		font-size: var(--fs-lg);
		color: var(--text);
		margin-bottom: var(--sp-1);
	}

	.next-action__text p {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		line-height: 1.4;
		max-width: 60ch;
	}

	.next-action__cta {
		flex-shrink: 0;
	}

	.cmd-map {
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.cmd-map__loading {
		padding: 60px 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		background: var(--surface-alt);
	}

	.cmd-map__foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-2);
		margin-top: var(--sp-3);
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}

	.cmd-link {
		background: none;
		border: none;
		color: var(--accent);
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
		cursor: pointer;
		padding: 0;
	}

	.cmd-link:hover {
		text-decoration: underline;
	}

	.cmd-stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-3);
	}

	.cmd-list {
		display: flex;
		flex-direction: column;
		gap: 0;
		margin: 0;
	}

	.cmd-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		padding: var(--sp-2) 0;
		border-bottom: 1px solid var(--border);
	}

	.cmd-row:last-child {
		border-bottom: none;
	}

	.cmd-row dt {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}

	.cmd-row dd {
		margin: 0;
		font-size: var(--fs-sm);
		font-weight: var(--fw-bold);
		color: var(--text);
		text-align: right;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.cmd-prod {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.cmd-prod__nums {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: var(--sp-3);
	}

	.cmd-prod__bar {
		height: 8px;
		background: var(--surface-alt);
		border-radius: var(--radius-pill);
		overflow: hidden;
	}

	.cmd-prod__fill {
		height: 100%;
		background: var(--accent);
		border-radius: var(--radius-pill);
		transition: width var(--dur) var(--ease);
	}

	.cmd-prod__pct {
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.cmd-prod__pct--muted {
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}
</style>

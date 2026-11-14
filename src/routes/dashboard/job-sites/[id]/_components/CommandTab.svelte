<!--
	CommandTab — the "Command" hub: the state of the project now plus the single
	clearest next action. Rebuilt on CardGrid so the cards are equal height
	(fixing the old Overview's mismatched panels). Cards: a next-action banner, a
	map preview, key stats (StatTile) and the contract summary. Until setup is done and a
	load is placed it shows a setup checklist instead of empty production cards.
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
	import PlanPace from './PlanPace.svelte';

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
		setupFields = [],
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
		setupFields?: { key: string; label: string; done: boolean }[];
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

	const contractValue = $derived(
		configForm.total_contract_value ?? contract?.contract_amount ?? costSummary?.value ?? null
	);

	// Until the project is set up and has a first load, Command is a checklist:
	// production cards would only show dashes.
	const setupMode = $derived(
		placedTons === 0 && (!hasLocation || (setupScore != null && setupScore < 90))
	);
	const checklist = $derived([
		{ key: 'location', label: 'Location and road line', done: hasLocation },
		...setupFields
	]);
	const checklistLeft = $derived(checklist.filter((f) => !f.done).length);
	const hasContract = $derived(
		contractValue != null ||
			!!contract?.customer_name ||
			!!contract?.project_number ||
			!!contract?.completion_date
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

{#if setupMode}
	<div class="setup-stack">
		<Card padding="md">
			<div class="setup">
				<div class="setup__head">
					<div>
						<span class="next-action__kicker">Setup</span>
						<strong class="setup__title">Finish setup to start tracking production</strong>
						<p class="setup__body">
							Production vs plan, yield and the schedule show up here once the project has a
							target and its first load.
						</p>
					</div>
					<span class="setup__left">{checklistLeft} left</span>
				</div>
				<ul class="setup__list">
					{#each checklist as item (item.key)}
						<li class="setup__item" class:setup__item--done={item.done}>
							<span class="setup__check" aria-hidden="true">{item.done ? '✓' : ''}</span>
							<span class="setup__label">
								{item.label}
								<span class="visually-hidden">{item.done ? '(done)' : '(missing)'}</span>
							</span>
							{#if !item.done}
								<button type="button" class="cmd-link" onclick={() => onGoToTab('plan')}>
									Set
								</button>
							{/if}
						</li>
					{/each}
				</ul>
				<div class="setup__cta">
					<Button onclick={() => onGoToTab('plan')}>Open Plan</Button>
				</div>
			</div>
		</Card>
		{#if hasLocation}
			<div class="setup-map">
			<Card title="Location" padding="sm">
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
			</Card>
			</div>
		{/if}
	</div>
{:else}
<PlanPace jobSiteId={jobSite.id} />

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

	{#if hasContract}
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
	{/if}

</CardGrid>
{/if}

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

	/* Setup cards size to their content (CardGrid would stretch them to match). */
	.setup-stack {
		display: grid;
		gap: var(--sp-4);
		align-items: start;
	}

	/* The page sidebar already shows the map on wide screens. */
	@media (min-width: 1024px) {
		.setup-map {
			display: none;
		}
	}

	.setup {
		display: grid;
		gap: var(--sp-4);
	}

	.setup__head {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: var(--sp-3);
	}

	.setup__title {
		display: block;
		font-size: var(--fs-lg);
		color: var(--text);
		margin-bottom: var(--sp-1);
	}

	.setup__body {
		margin: 0;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		max-width: 60ch;
	}

	.setup__left {
		flex-shrink: 0;
		padding: 4px 10px;
		border-radius: 999px;
		border: 1px solid var(--warn);
		color: var(--warn);
		font-size: var(--fs-xs, 0.8rem);
		font-weight: var(--fw-bold);
	}

	.setup__list {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		overflow: hidden;
	}

	.setup__item {
		display: grid;
		grid-template-columns: 28px 1fr auto;
		align-items: center;
		gap: var(--sp-3);
		min-height: 48px;
		padding: 0 var(--sp-3);
	}

	.setup__item + .setup__item {
		border-top: 1px solid var(--border);
	}

	.setup__check {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		border: 2px solid var(--text-muted);
		font-size: 0.75rem;
		font-weight: 900;
	}

	.setup__item--done .setup__check {
		background: var(--good);
		border-color: var(--good);
		color: var(--bg);
	}

	.setup__item--done .setup__label {
		color: var(--text-muted);
	}

	.setup__label {
		font-weight: var(--fw-semibold);
	}

	.setup__item .cmd-link {
		min-height: 44px;
		padding: 0 var(--sp-2);
	}

	.setup__cta {
		display: flex;
		justify-content: flex-end;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
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
</style>

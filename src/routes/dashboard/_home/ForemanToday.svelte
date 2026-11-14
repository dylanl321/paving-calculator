<!--
	ForemanToday — answers the foreman's first question for one job: "are we
	going to finish what we ordered today, and when?" The headline IS the
	answer ("On pace, done by 2:40 PM"); feet left, tons left, rate and loads
	sit under it, with Add load one tap away.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import AddLoadSheet from '$lib/components/AddLoadSheet.svelte';
	import { spreadSpecCheck } from '$lib/config';
	import { computeTodayAnswer, formatClock, type TodayLoad } from '$lib/today-answer';
	import type { EnrichedProject } from '$lib/loaders/project-summaries';

	let { job }: { job: EnrichedProject } = $props();

	interface LoadRow extends TodayLoad {
		id: string;
		ticket_number: string | null;
	}

	let loads = $state<LoadRow[]>([]);
	let targetTons = $state<number | null>(null);
	let endTime = $state<string | null>(null);
	let laneWidthFt = $state<number | null>(null);
	let targetRate = $state<number | null>(null);
	let loaded = $state(false);
	let addOpen = $state(false);
	let now = $state(new Date());

	function localToday(): string {
		const d = new Date();
		const m = String(d.getMonth() + 1).padStart(2, '0');
		const day = String(d.getDate()).padStart(2, '0');
		return `${d.getFullYear()}-${m}-${day}`;
	}

	async function getJson<T>(url: string): Promise<T | null> {
		try {
			const res = await fetch(url, { credentials: 'include' });
			return res.ok ? ((await res.json()) as T) : null;
		} catch {
			return null;
		}
	}

	async function refresh() {
		const today = localToday();
		const [loadsBody, logsBody, configBody] = await Promise.all([
			getJson<{ loads: LoadRow[] }>(`/api/job-sites/${job.id}/loads?start_date=${today}&end_date=${today}`),
			getJson<{ logs: Array<{ log_date: string; target_tons: number | null; end_time: string | null }> }>(
				`/api/job-sites/${job.id}/logs?limit=1`
			),
			getJson<{ config: { lane_width_ft?: number | null; target_spread_rate?: number | null } | null }>(
				`/api/job-sites/${job.id}/config`
			)
		]);
		loads = loadsBody?.loads ?? [];
		const todayLog = logsBody?.logs?.find((l) => l.log_date === today) ?? null;
		targetTons = todayLog?.target_tons ?? null;
		endTime = todayLog?.end_time ?? null;
		laneWidthFt = configBody?.config?.lane_width_ft ?? null;
		targetRate = configBody?.config?.target_spread_rate ?? null;
		now = new Date();
		loaded = true;
	}

	onMount(() => {
		refresh();
		const timer = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(timer);
	});

	const answer = $derived(
		computeTodayAnswer({ loads, targetTons, laneWidthFt, targetRateLbsSy: targetRate, endTime, now })
	);
	const recent = $derived(
		[...loads].filter((l) => !l.rejected).sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
	);
	const nextLoadNumber = $derived(loads.filter((l) => !l.rejected).length + 1);
	const fmt = (n: number | null, digits = 0) =>
		n == null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

	function rateTone(rate: number | null): 'good' | 'warn' | 'bad' | 'none' {
		return spreadSpecCheck(rate, targetRate, null)?.status ?? 'none';
	}
</script>

<section class="today" aria-labelledby="today-headline">
	<p class="today__job">
		<a href="/dashboard/job-sites/{job.id}">{job.name}</a>
		{#if job.crew_name}<span> · {job.crew_name}</span>{/if}
	</p>
	<h1 id="today-headline" class="today__headline today__headline--{answer.tone}">
		{loaded ? answer.headline : 'Loading today…'}
	</h1>
	{#if loaded && answer.loadCount > 0}
		<p class="today__sub">
			{answer.loadCount} load{answer.loadCount === 1 ? '' : 's'} · {fmt(answer.placedTons, 1)} t placed
			{#if answer.feetPlaced != null}· about {fmt(answer.feetPlaced)} ft{/if}
		</p>
	{/if}

	<div class="today__stats">
		<div class="stat">
			<span class="stat__label">Feet left today</span>
			<span class="stat__value">{answer.feetLeft != null ? `${fmt(answer.feetLeft)} ft` : '—'}</span>
			<span class="stat__note">
				{#if answer.feetLeft == null}
					{targetTons == null ? "Set today's tons ordered in the log" : 'Set width and spread rate in Setup'}
				{:else}
					At {laneWidthFt} ft wide, {targetRate} lbs/SY
				{/if}
			</span>
		</div>
		<div class="stat">
			<span class="stat__label">Tons still to place</span>
			<span class="stat__value">{answer.tonsLeft != null ? `${fmt(answer.tonsLeft)} t` : '—'}</span>
			<span class="stat__note">
				{#if answer.loadsLeft != null && answer.loadsLeft > 0}
					About {answer.loadsLeft} more load{answer.loadsLeft === 1 ? '' : 's'}
				{:else if targetTons != null}
					Of {fmt(targetTons)} t ordered
				{:else}
					No order set for today
				{/if}
			</span>
		</div>
		<div class="stat">
			<span class="stat__label">Rate today</span>
			<span class="stat__value">
				{answer.avgRateLbsSy != null ? fmt(answer.avgRateLbsSy) : '—'}
				{#if answer.avgRateLbsSy != null}<small>lbs/SY</small>{/if}
			</span>
			<span class="stat__note">{targetRate ? `Target ${targetRate}` : 'No target rate set'}</span>
		</div>
		<div class="stat">
			<span class="stat__label">Pace</span>
			<span class="stat__value">{answer.tonsPerHour != null ? `${fmt(answer.tonsPerHour)} t/h` : '—'}</span>
			<span class="stat__note">
				{answer.finishAt ? `Done around ${formatClock(answer.finishAt)}` : 'Shows after 20 minutes of loads'}
			</span>
		</div>
	</div>

	{#if answer.loadsLeft != null && answer.loadsLeft > 0 && answer.loadsLeft <= 5}
		<p class="today__call" role="status">
			<strong>{answer.loadsLeft} more load{answer.loadsLeft === 1 ? '' : 's'} finish today's order.</strong>
			Call the plant now if you need more or want to cut it off.
		</p>
	{/if}

	<div class="today__actions">
		<Button onclick={() => (addOpen = true)}>Add load</Button>
		<Button variant="secondary" href="/dashboard/map?job={job.id}">See it on the map</Button>
		<Button variant="ghost" href="/dashboard/job-sites/{job.id}/log">{job.today_log_open ? "Today's log and close day" : "Start today's log"}</Button>
	</div>

	{#if recent.length > 0}
		<div class="loads">
			<h2>Last loads</h2>
			<ul>
				{#each recent as load, i (load.id)}
					{@const tone = rateTone(load.spread_rate)}
					<li>
						<span class="dot dot--{tone}" aria-hidden="true"></span>
						<span class="loads__n">#{nextLoadNumber - 1 - i}</span>
						<span class="loads__t">{fmt(load.tons, 1)} t</span>
						<span class="loads__rate">{load.spread_rate != null ? `${fmt(load.spread_rate)} lbs/SY` : 'No rate'}</span>
						<span class="loads__time">{formatClock(new Date(load.timestamp * 1000))}</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</section>

<AddLoadSheet
	bind:open={addOpen}
	jobSiteId={job.id}
	jobName={job.name}
	{nextLoadNumber}
	{laneWidthFt}
	targetRateLbsSy={targetRate}
	onsaved={refresh}
/>

<style>
	.today {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
		margin-bottom: var(--sp-6);
	}
	.today__job {
		margin: 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.today__job a {
		color: inherit;
		font-weight: var(--fw-medium);
	}
	.today__headline {
		margin: 0;
		font-size: clamp(1.75rem, 4vw, 2.25rem);
		font-weight: var(--fw-semibold);
		letter-spacing: -0.02em;
		line-height: 1.15;
	}
	.today__headline--warn {
		color: var(--warn);
	}
	.today__sub {
		margin: -8px 0 0;
		color: var(--text-muted);
	}
	.today__stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
		gap: var(--sp-3);
	}
	.stat {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
	}
	.stat__label {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		font-weight: var(--fw-medium);
	}
	.stat__value {
		font-size: 1.875rem;
		font-weight: var(--fw-semibold);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.stat__value small {
		font-size: var(--fs-sm);
		font-weight: var(--fw-medium);
	}
	.stat__note {
		font-size: var(--fs-sm);
		color: var(--text-muted);
	}
	.today__call {
		margin: 0;
		padding: var(--sp-3) var(--sp-4);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		background: var(--surface-alt);
	}
	.today__actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-2);
	}
	.loads {
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		padding: var(--sp-2) var(--sp-4);
	}
	.loads h2 {
		margin: var(--sp-2) 0;
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}
	.loads ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.loads li {
		display: flex;
		align-items: center;
		gap: var(--sp-3);
		min-height: 44px;
		border-top: 1px solid var(--border);
		font-variant-numeric: tabular-nums;
	}
	.loads__n {
		width: 40px;
		color: var(--text-muted);
	}
	.loads__t {
		width: 70px;
		font-weight: var(--fw-medium);
	}
	.loads__rate {
		flex: 1;
	}
	.loads__time {
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--border);
		flex: none;
	}
	.dot--good {
		background: var(--good);
	}
	.dot--warn {
		background: var(--warn);
	}
	.dot--bad {
		background: var(--bad);
	}
</style>

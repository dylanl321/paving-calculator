<script lang="ts">
	import { onMount } from 'svelte';
	import type { Pace, PlanStatus } from '$lib/plan-status';

	let { jobSiteId }: { jobSiteId: string } = $props();

	let status = $state<PlanStatus | null>(null);
	let loading = $state(true);
	let error = $state('');

	const paceLabel: Record<Pace, string> = {
		ahead: 'Ahead of schedule',
		on_track: 'On schedule',
		behind: 'Behind schedule',
		no_plan: 'No schedule to compare'
	};

	onMount(() => {
		void load();
	});

	async function load() {
		loading = true;
		error = '';
		try {
			const res = await fetch(`/api/job-sites/${jobSiteId}/plan-status`, { credentials: 'include' });
			const body = (await res.json()) as { status?: PlanStatus; error?: string };
			if (!res.ok || !body.status) {
				error = body.error ?? 'Could not load production vs plan';
				return;
			}
			status = body.status;
		} catch {
			error = 'Could not load production vs plan';
		} finally {
			loading = false;
		}
	}

	function bar(pct: number | null): string {
		if (pct == null) return '0%';
		return `${Math.max(0, Math.min(100, pct))}%`;
	}
</script>

<section class="pace" aria-labelledby="pace-title">
	<div class="pace-head">
		<h3 id="pace-title">Production vs plan</h3>
		{#if status}
			<span class="pill pill-{status.pace}">{paceLabel[status.pace]}</span>
		{/if}
	</div>
	{#if loading}
		<p class="muted">Loading production…</p>
	{:else if error}
		<p class="error" role="alert">{error}</p>
	{:else if status}
		<div class="metrics">
			<div>
				<span class="k">Tons</span>
				<strong>{status.placedTons.toLocaleString()} / {status.plannedTons?.toLocaleString() ?? '—'}</strong>
				<div class="track" aria-hidden="true"><span style:width={bar(status.tonsPct)}></span></div>
				<span class="sub">{status.tonsRemaining != null ? `${status.tonsRemaining.toLocaleString()} t remaining` : 'No planned tonnage'}</span>
			</div>
			<div>
				<span class="k">Length</span>
				<strong>{status.pavedMiles} mi / {status.totalMiles ?? '—'}</strong>
				<div class="track" aria-hidden="true"><span style:width={bar(status.lengthPct)}></span></div>
				<span class="sub">{status.pavedFt.toLocaleString()} ft paved</span>
			</div>
			<div>
				<span class="k">Yield</span>
				<strong>
					{status.actualSpreadLbsSy ?? '—'}
					<span class="unit">lbs/sy</span>
				</strong>
				<span class="sub">
					Target {status.targetSpreadLbsSy ?? '—'}
					{#if status.spreadDeltaPct != null}
						({status.spreadDeltaPct > 0 ? '+' : ''}{status.spreadDeltaPct}%)
					{/if}
				</span>
			</div>
			<div>
				<span class="k">Schedule</span>
				<strong>{status.daysRemaining ?? '—'} <span class="unit">days left</span></strong>
				<span class="sub">
					{status.weatherDays} weather day{status.weatherDays === 1 ? '' : 's'}
					{#if status.expectedTonsPct != null}
						· expected {status.expectedTonsPct}%
					{/if}
				</span>
			</div>
		</div>
		<a class="report-link" href="/dashboard/job-sites/{jobSiteId}/report">Printable summary</a>
	{/if}
</section>

<style>
	.pace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.pace-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: var(--sp-3);
		flex-wrap: wrap;
	}

	h3 { margin: 0; }

	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: var(--sp-4);
	}

	.k {
		display: block;
		font-size: var(--fs-xs);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	strong { font-size: var(--fs-lg); }

	.unit { font-size: var(--fs-sm); font-weight: 500; color: var(--text-muted); }

	.sub { display: block; color: var(--text-muted); font-size: var(--fs-sm); }

	.track {
		height: 8px;
		background: var(--surface-alt, var(--border));
		border-radius: 99px;
		overflow: hidden;
		margin: 6px 0;
	}

	.track span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.pill {
		min-height: 32px;
		display: inline-flex;
		align-items: center;
		padding: 0 var(--sp-3);
		border-radius: 99px;
		font-size: var(--fs-sm);
		font-weight: 700;
	}

	.pill-ahead { background: color-mix(in srgb, var(--good) 20%, var(--surface)); color: var(--good); }
	.pill-on_track { background: color-mix(in srgb, var(--accent) 18%, var(--surface)); color: var(--text); }
	.pill-behind { background: color-mix(in srgb, var(--bad) 18%, var(--surface)); color: var(--bad); }
	.pill-no_plan { background: var(--surface-alt, var(--border)); color: var(--text-muted); }

	.muted { color: var(--text-muted); margin: 0; }
	.error { color: var(--bad); margin: 0; }

	.report-link {
		color: var(--text);
		font-weight: 600;
		min-height: 48px;
		display: inline-flex;
		align-items: center;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import type { Pace } from '$lib/plan-status';

	interface Row {
		id: string;
		name: string;
		pace: Pace;
		tonsPct: number | null;
		daysRemaining: number | null;
		weatherDays: number;
	}

	let rows = $state<Row[]>([]);
	let behind = $state(0);
	let ahead = $state(0);
	let loading = $state(true);

	const label: Record<Pace, string> = {
		ahead: 'Ahead',
		on_track: 'On schedule',
		behind: 'Behind',
		no_plan: 'No schedule'
	};

	onMount(() => {
		void load();
	});

	async function load() {
		try {
			const res = await fetch('/api/org/plan-status', { credentials: 'include' });
			if (!res.ok) return;
			const body = (await res.json()) as { projects?: Row[]; behind?: number; ahead?: number };
			rows = body.projects ?? [];
			behind = body.behind ?? 0;
			ahead = body.ahead ?? 0;
		} finally {
			loading = false;
		}
	}
</script>

{#if !loading && rows.length > 0}
	<section class="strip" aria-label="Production versus plan">
		<header>
			<h2>Active projects vs plan</h2>
			<p>{ahead} ahead · {behind} behind · weather days are not counted as missed production</p>
		</header>
		<ul>
			{#each rows as row (row.id)}
				<li>
					<a href="/dashboard/job-sites/{row.id}">{row.name}</a>
					<span class="pace pace-{row.pace}">{label[row.pace]}</span>
					<span>{row.tonsPct != null ? `${row.tonsPct}% tons` : '—'}</span>
					<span>{row.daysRemaining != null ? `${row.daysRemaining} days left` : ''}</span>
					{#if row.weatherDays > 0}<span>{row.weatherDays} weather</span>{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.strip {
		margin: 0 0 var(--sp-6);
		padding: var(--sp-4);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	h2 { margin: 0 0 4px; font-size: var(--fs-lg); }
	header p { margin: 0 0 var(--sp-3); color: var(--text-muted); font-size: var(--fs-sm); }

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--sp-3);
		align-items: center;
		min-height: 48px;
	}

	a { color: var(--text); font-weight: 700; }

	.pace { font-size: var(--fs-sm); font-weight: 700; }
	.pace-behind { color: var(--bad); }
	.pace-ahead { color: var(--good); }
	.pace-on_track, .pace-no_plan { color: var(--text-muted); }
</style>

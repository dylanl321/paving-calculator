<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { spreadRateFromThickness, stickCheck } from '$lib/config/formulas';
	import { findTool } from '$lib/workspace/tools';
	import JobBar from '$lib/components/workspace/JobBar.svelte';
	import ToolList from '$lib/components/workspace/ToolList.svelte';
	import SpreadRateChart from '$lib/components/charts/SpreadRateChart.svelte';

	const activeTool = $derived(findTool($page.url.searchParams.get('tool')));
	const ActiveComponent = $derived(activeTool.component);

	function selectTool(id: string) {
		const url = new URL($page.url);
		url.searchParams.set('tool', id);
		goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	const targetRate = $derived(
		job.thicknessIn > 0 ? Math.round(spreadRateFromThickness(job.thicknessIn)) : 0
	);
	const looseHeight = $derived(job.thicknessIn > 0 ? stickCheck(job.thicknessIn) : 0);
</script>

<svelte:head>
	<title>{config.app.name} — Workspace</title>
</svelte:head>

<div class="workspace">
	<JobBar />

	<div class="panes">
		<aside class="tools" aria-label="Tool picker">
			<ToolList activeId={activeTool.id} onselect={selectTool} />
		</aside>

		<section class="stage">
			<header class="stage-head">
				<div class="eyebrow">Calculator</div>
				<h1 class="stage-title">{activeTool.label}</h1>
			</header>

			<div class="stage-body">
				<ActiveComponent />
			</div>
		</section>

		<aside class="rates" aria-label="Live rates">
			<div class="eyebrow">Live Rates</div>
			<div class="rate-stats">
				<div class="rate-stat">
					<span class="rv">{targetRate}</span>
					<span class="ru">lbs/SY</span>
					<span class="rl">Target spread</span>
				</div>
				<div class="rate-stat">
					<span class="rv">{looseHeight.toFixed(2)}</span>
					<span class="ru">in</span>
					<span class="rl">Loose behind screed</span>
				</div>
			</div>

			<div class="chart-block">
				<div class="eyebrow">Spread Rate vs Target</div>
				<SpreadRateChart {targetRate} />
			</div>
		</aside>
	</div>
</div>

<style>
	.workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.panes {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.tools {
		order: 1;
	}
	.stage {
		order: 0;
	}
	.rates {
		order: 2;
	}

	/* Mobile: tool list becomes a horizontal scroller is too cramped; keep it
	   stacked but visually grouped. Stage shows first so the active calc is
	   immediately usable, tools + rates below. */

	.stage-head {
		margin-bottom: var(--sp-4);
	}
	.stage-title {
		margin: 2px 0 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-heavy);
		letter-spacing: 0.2px;
	}

	.rate-stats {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--sp-2);
		margin-top: var(--sp-2);
	}
	.rate-stat {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-3);
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.rv {
		font-size: var(--fs-xl);
		font-weight: var(--fw-heavy);
		color: var(--accent);
		line-height: 1;
	}
	.ru {
		font-size: var(--fs-xs);
		color: var(--text-muted);
	}
	.rl {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		margin-top: 2px;
	}
	.chart-block {
		margin-top: var(--sp-4);
	}
	.chart-block .eyebrow {
		display: block;
		margin-bottom: var(--sp-2);
	}

	/* Desktop: three columns — tool list | stage | live rates */
	@media (min-width: 1100px) {
		.panes {
			display: grid;
			grid-template-columns: var(--toollist-w) 1fr var(--context-w);
			gap: var(--sp-6);
			align-items: start;
		}
		.tools {
			order: 0;
			position: sticky;
			top: var(--sp-4);
		}
		.stage {
			order: 1;
			min-width: 0;
		}
		.rates {
			order: 2;
			position: sticky;
			top: var(--sp-4);
		}
	}

	/* Tablet: tool list + stage; rates fold under the stage */
	@media (min-width: 768px) and (max-width: 1099px) {
		.panes {
			display: grid;
			grid-template-columns: var(--toollist-w) 1fr;
			gap: var(--sp-5);
			align-items: start;
		}
		.tools {
			order: 0;
			position: sticky;
			top: var(--sp-4);
		}
		.stage {
			order: 1;
			min-width: 0;
		}
		.rates {
			order: 2;
			grid-column: 1 / -1;
		}
	}
</style>

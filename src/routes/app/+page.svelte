<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { job } from '$lib/stores/job.svelte';
	import { spreadRateFromThickness, stickCheck } from '$lib/config/formulas';
	import { findTool, allTools } from '$lib/workspace/tools';
	import JobBar from '$lib/components/workspace/JobBar.svelte';
	import ToolList from '$lib/components/workspace/ToolList.svelte';
	import SpreadRateChart from '$lib/components/charts/SpreadRateChart.svelte';
	import TodayView from '$lib/components/workspace/TodayView.svelte';
	import TodaySummary from '$lib/components/workspace/TodaySummary.svelte';
	import LogToToday from '$lib/components/workspace/LogToToday.svelte';
	import UnitToggle from '$lib/components/UnitToggle.svelte';
	import { logDraft } from '$lib/stores/logDraft.svelte';

	const isToday = $derived($page.url.searchParams.get('view') === 'today');
	const activeTool = $derived(findTool($page.url.searchParams.get('tool')));
	const ActiveComponent = $derived(activeTool.component);

	function selectTool(id: string) {
		logDraft.set(null);
		const url = new URL($page.url);
		url.searchParams.set('tool', id);
		url.searchParams.delete('view');
		goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	function selectToday() {
		const url = new URL($page.url);
		url.searchParams.set('view', 'today');
		goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	const targetRate = $derived(
		job.thicknessIn > 0 ? Math.round(spreadRateFromThickness(job.thicknessIn)) : 0
	);
	const looseHeight = $derived(job.thicknessIn > 0 ? stickCheck(job.thicknessIn) : 0);

	// Mobile swipe state
	let swipeOffset = $state(0);
	let showHints = $state(false);
	let hintTimeout: number | undefined;
	let isDraggingStage = $state(false);

	// Swipe navigation action
	function swipeNav(node: HTMLElement) {
		let startX = 0;
		let startY = 0;
		let currentX = 0;
		let isDragging = false;
		let isMobile = false;

		function checkMobile() {
			isMobile = window.innerWidth < 768;
		}

		function onPointerDown(e: PointerEvent) {
			checkMobile();
			if (!isMobile) return;

			startX = e.clientX;
			startY = e.clientY;
			currentX = e.clientX;
			isDragging = true;
			isDraggingStage = true;
			showHints = false;
			if (hintTimeout) clearTimeout(hintTimeout);
		}

		function onPointerMove(e: PointerEvent) {
			if (!isDragging || !isMobile) return;

			currentX = e.clientX;
			const dx = currentX - startX;
			const dy = e.clientY - startY;

			// Only apply offset if predominantly horizontal
			if (Math.abs(dx) > Math.abs(dy)) {
				swipeOffset = dx;
			}
		}

		function onPointerUp(e: PointerEvent) {
			if (!isDragging || !isMobile) {
				isDragging = false;
				isDraggingStage = false;
				swipeOffset = 0;
				return;
			}

			const dx = currentX - startX;
			const dy = e.clientY - startY;

			isDragging = false;
			isDraggingStage = false;
			swipeOffset = 0;

			// Only trigger if predominantly horizontal and meets threshold
			if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
				navigateSwipe(dx > 0 ? 'prev' : 'next');
			}

			// Reset hints after interaction
			if (hintTimeout) clearTimeout(hintTimeout);
			hintTimeout = window.setTimeout(() => {
				showHints = true;
			}, 500);
		}

		function navigateSwipe(direction: 'prev' | 'next') {
			const currentIndex = isToday ? -1 : allTools.findIndex((t) => t.id === activeTool.id);

			if (direction === 'next') {
				if (isToday) {
					// From Today to first tool
					selectTool(allTools[0].id);
				} else if (currentIndex < allTools.length - 1) {
					selectTool(allTools[currentIndex + 1].id);
				}
			} else {
				// prev
				if (currentIndex === 0) {
					// From first tool to Today
					selectToday();
				} else if (currentIndex > 0) {
					selectTool(allTools[currentIndex - 1].id);
				}
			}
		}

		node.addEventListener('pointerdown', onPointerDown);
		node.addEventListener('pointermove', onPointerMove);
		node.addEventListener('pointerup', onPointerUp);
		node.addEventListener('pointercancel', onPointerUp);

		checkMobile();
		window.addEventListener('resize', checkMobile);

		// Show hints after initial delay
		hintTimeout = window.setTimeout(() => {
			showHints = true;
		}, 500);

		return {
			destroy() {
				node.removeEventListener('pointerdown', onPointerDown);
				node.removeEventListener('pointermove', onPointerMove);
				node.removeEventListener('pointerup', onPointerUp);
				node.removeEventListener('pointercancel', onPointerUp);
				window.removeEventListener('resize', checkMobile);
				if (hintTimeout) clearTimeout(hintTimeout);
			}
		};
	}

	// Determine if prev/next are available
	const canGoPrev = $derived(() => {
		if (isToday) return false;
		const idx = allTools.findIndex((t) => t.id === activeTool.id);
		return idx > 0 || idx === 0; // Can go to Today from first tool
	});

	const canGoNext = $derived(() => {
		if (isToday) return true; // Can go to first tool from Today
		const idx = allTools.findIndex((t) => t.id === activeTool.id);
		return idx >= 0 && idx < allTools.length - 1;
	});
</script>

<svelte:head>
	<title>{config.app.name} — Workspace</title>
</svelte:head>

<div class="workspace">
	<JobBar />

	<div class="panes">
		<aside class="tools" aria-label="Tool picker">
			<div class="tools-header">
				<div class="eyebrow">Calculators</div>
			</div>
			<ToolList
				activeId={isToday ? '' : activeTool.id}
				todayActive={isToday}
				onselect={selectTool}
				onselecttoday={selectToday}
			/>
		</aside>

		{#if isToday}
			<section
				class="stage"
				class:stage-dragging={isDraggingStage}
				use:swipeNav
				style="transform: translateX({swipeOffset}px);"
			>
				{#if showHints && canGoNext()}
					<div class="swipe-hint swipe-hint-right">›</div>
				{/if}
				<header class="stage-head">
					<div class="eyebrow">Daily Record</div>
					<h1 class="stage-title">Today</h1>
				</header>
				<div class="stage-body">
					<TodayView />
				</div>
			</section>

			<aside class="rates" aria-label="Day totals">
				<div class="rates-header">
					<div class="eyebrow">Day Totals</div>
				</div>
				<div class="pane-summary">
					<TodaySummary variant="compact" />
				</div>
			</aside>
		{:else}
			<section class="stage" use:swipeNav style="transform: translateX({swipeOffset}px);">
				{#if showHints && canGoPrev()}
					<div class="swipe-hint swipe-hint-left">‹</div>
				{/if}
				{#if showHints && canGoNext()}
					<div class="swipe-hint swipe-hint-right">›</div>
				{/if}
				<header class="stage-head">
					<div class="stage-head-row">
						<div>
							<div class="eyebrow">Calculator</div>
							<h1 class="stage-title">{activeTool.label}</h1>
						</div>
						<UnitToggle />
					</div>
				</header>

				<div class="stage-body">
					{#key activeTool.id}
						<ActiveComponent />
						<LogToToday tool={activeTool} ongoToToday={selectToday} />
					{/key}
				</div>
			</section>

			<aside class="rates" aria-label="Live rates">
				<div class="rates-header">
					<div class="eyebrow">Live Rates</div>
				</div>
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
		{/if}
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
		order: 0;
	}
	.stage {
		order: 1;
		position: relative;
		transition: transform 0.15s ease-out;
		touch-action: pan-y;
	}

	.swipe-hint {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		font-size: 48px;
		color: var(--text-muted);
		opacity: 0;
		pointer-events: none;
		z-index: 1;
		animation: fadeInHint 0.3s ease-out 0.5s forwards;
		user-select: none;
	}

	.swipe-hint-left {
		left: 8px;
	}

	.swipe-hint-right {
		right: 8px;
	}

	@keyframes fadeInHint {
		from {
			opacity: 0;
		}
		to {
			opacity: 0.35;
		}
	}

	@media (min-width: 768px) {
		.swipe-hint {
			display: none;
		}
	}
	.rates {
		order: 2;
	}

	/* Mobile: tool picker sits at the top as a horizontal chip menu (see ToolList),
	   then the active calculator, then live rates below. */
	@media (max-width: 767px) {
		.tools {
			margin: 0 calc(-1 * var(--sp-4));
			padding: var(--sp-2) var(--sp-4);
			border-bottom: 1px solid var(--border);
		}
	}

	.tools-header {
		display: none;
	}

	.rates-header {
		display: none;
	}

	.stage-head {
		margin-bottom: var(--sp-4);
	}
	.stage-head-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--sp-3);
		flex-wrap: wrap;
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
	.pane-summary {
		margin-top: var(--sp-2);
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
		.tools-header {
			display: block;
			margin-bottom: var(--sp-3);
		}
		.stage {
			order: 1;
			min-width: 0;
			max-width: 720px;
		}
		.stage-head {
			position: sticky;
			top: 0;
			background: var(--bg);
			z-index: 2;
			padding-bottom: var(--sp-3);
		}
		.rates {
			order: 2;
			position: sticky;
			top: var(--sp-4);
		}
		.rates-header {
			display: block;
			padding-bottom: var(--sp-3);
			margin-bottom: var(--sp-3);
			border-bottom: 1px solid var(--border);
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

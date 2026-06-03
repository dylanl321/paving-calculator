<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { config } from '$lib/config';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { spreadRateFromThickness, stickCheck } from '$lib/config/formulas';
	import { findTool, allTools, toolGroups } from '$lib/workspace/tools';
	import JobBar from '$lib/components/workspace/JobBar.svelte';
	import ToolList from '$lib/components/workspace/ToolList.svelte';
	import SpreadRateChart from '$lib/components/charts/SpreadRateChart.svelte';
	import UnitToggle from '$lib/components/UnitToggle.svelte';
	import HomePrimaryCalcs from '$lib/components/workspace/HomePrimaryCalcs.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import ScreedManView from '$lib/components/ScreedManView.svelte';
	import CalcHistoryLog from '$lib/components/CalcHistoryLog.svelte';

	const isScreedMan = $derived(authStore.org?.role === 'screed_man');

	const activeTool = $derived(findTool($page.url.searchParams.get('tool')));
	const isHome = $derived(activeTool == null);
	const ActiveComponent = $derived(activeTool?.component);
	const activeToolGroup = $derived(toolGroups.find(g => g.tools.some(t => t.id === activeTool?.id)) ?? null);

	function selectTool(id: string) {
		const url = new URL($page.url);
		url.searchParams.set('tool', id);
		goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	function selectHome() {
		const url = new URL($page.url);
		url.searchParams.delete('tool');
		goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	const thicknessIn = $derived(calcContext.lift_thickness.value);
	const targetRate = $derived(
		thicknessIn > 0 ? Math.round(spreadRateFromThickness(thicknessIn)) : 0
	);
	const looseHeight = $derived(thicknessIn > 0 ? stickCheck(thicknessIn) : 0);

	// Mobile swipe state
	let swipeOffset = $state(0);
	let showHints = $state(false);
	let historyOpen = $state(false);
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
			isMobile = window.innerWidth < 900;
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
			const currentIndex = isHome ? -1 : allTools.findIndex((t) => t.id === activeTool?.id);

			if (direction === 'next') {
				if (isHome) {
					// From Home to first tool
					selectTool(allTools[0].id);
				} else if (currentIndex >= 0 && currentIndex < allTools.length - 1) {
					selectTool(allTools[currentIndex + 1].id);
				}
			} else {
				// prev
				if (isHome) {
					// Already at the start
					return;
				} else if (currentIndex === 0) {
					// From first tool back to Home
					selectHome();
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
		if (isHome) return false;
		const idx = allTools.findIndex((t) => t.id === activeTool?.id);
		return idx >= 0; // Can go to Home (or prev tool) from any tool
	});

	const canGoNext = $derived(() => {
		if (isHome) return true; // Can go to first tool from Home
		const idx = allTools.findIndex((t) => t.id === activeTool?.id);
		return idx >= 0 && idx < allTools.length - 1;
	});
</script>

<svelte:head>
	<title>{config.app.name} — Workspace</title>
</svelte:head>

{#if isScreedMan}
	<ScreedManView />
{:else}
<div class="workspace">
	<JobBar />

	<div class="panes">
		<aside class="tools" aria-label="Tool picker">
			<div class="tools-header">
				<div class="eyebrow">Calculators</div>
			</div>
			<ToolList
				activeId={isHome ? '' : activeTool?.id ?? ''}
				homeActive={isHome}
				onselect={selectTool}
				onselecthome={selectHome}
			/>
		</aside>

		{#if isHome}
			<section
				class="stage"
				class:stage-dragging={isDraggingStage}
				use:swipeNav
				style="transform: translateX({swipeOffset}px);"
			>
				{#if showHints && canGoPrev()}
					<div class="swipe-hint swipe-hint-left">‹</div>
				{/if}
				{#if showHints && canGoNext()}
					<div class="swipe-hint swipe-hint-right">›</div>
				{/if}
				<header class="stage-head">
					<div class="stage-head-row">
						<div>
							<div class="eyebrow">Workspace</div>
							<h1 class="stage-title">Home</h1>
						</div>
						<UnitToggle />
					</div>
				</header>

				<div class="stage-body">
					<HomePrimaryCalcs />

					<section class="history-section">
						<button
							class="history-toggle"
							onclick={() => (historyOpen = !historyOpen)}
							aria-expanded={historyOpen}
						>
							<span>Recent Calculations</span>
							<svg
								width="18"
								height="18"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								style="transition:transform 0.2s;transform:rotate({historyOpen ? 180 : 0}deg);flex-shrink:0;"
							>
								<polyline points="6 9 12 15 18 9" />
							</svg>
						</button>
						{#if historyOpen}
							<div class="history-panel">
								<CalcHistoryLog />
							</div>
						{/if}
					</section>
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
		{:else}
			<section class="stage" use:swipeNav style="transform: translateX({swipeOffset}px);">
				{#if showHints && canGoPrev()}
					<div class="swipe-hint swipe-hint-left">‹</div>
				{/if}
				{#if showHints && canGoNext()}
					<div class="swipe-hint swipe-hint-right">›</div>
				{/if}
				<header class="stage-head">
					<!-- Desktop/tablet breadcrumb -->
					<nav class="breadcrumb" aria-label="Breadcrumb">
						<button type="button" class="breadcrumb-link" onclick={selectHome}>Home</button>
						<span class="breadcrumb-sep">/</span>
						{#if activeToolGroup}
							<span class="breadcrumb-group">{activeToolGroup.label}</span>
							<span class="breadcrumb-sep">/</span>
						{/if}
						<span class="breadcrumb-current">{activeTool?.label ?? ''}</span>
					</nav>

					<!-- Mobile back button -->
					<button type="button" class="back-btn" onclick={selectHome} aria-label="Back to home">
						<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
							<path d="M12.5 15L7.5 10L12.5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
						Back
					</button>

					<div class="stage-head-row">
						<div>
							<div class="eyebrow">Calculator</div>
							<h1 class="stage-title">{activeTool?.label ?? ''}</h1>
						</div>
						<UnitToggle />
					</div>
				</header>

				<div class="stage-body">
					{#if activeTool && ActiveComponent}
						{#key activeTool.id}
							<ActiveComponent />
						{/key}
					{/if}
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
{/if}

<style>
	.workspace {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	/* ── Calc History Section ───────────────────────────────────────────── */
	.history-section {
		margin-top: 1.5rem;
	}

	.history-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: 48px;
		padding: 0.75rem 1rem;
		background: var(--surface-2, #1a1a1a);
		border: 1px solid var(--border-subtle, #2e2e2e);
		border-radius: 8px;
		color: var(--text, #f0f0f0);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s, border-color 0.15s;
	}
	.history-toggle:hover {
		background: var(--surface-3, #242424);
		border-color: var(--border, #444);
	}

	.history-panel {
		margin-top: 0.5rem;
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

	@media (min-width: 900px) {
		.swipe-hint {
			display: none;
		}
	}
	.rates {
		order: 2;
	}

	/* Mobile: tool picker sits at the top as a horizontal chip menu (see ToolList),
	   then the active calculator, then live rates below. */
	@media (max-width: 899px) {
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
		min-width: 0;
	}
	.stage-head-row > div {
		min-width: 0;
		flex: 1 1 auto;
	}
	.stage-title {
		margin: 2px 0 0;
		font-size: var(--fs-xl);
		font-weight: var(--fw-heavy);
		letter-spacing: 0.2px;
	}

	/* Breadcrumb navigation */
	.breadcrumb {
		display: none;
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin-bottom: var(--sp-3);
		line-height: 1.4;
	}

	.breadcrumb-link {
		background: none;
		border: none;
		padding: 0;
		color: var(--text-muted);
		cursor: pointer;
		font-size: inherit;
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.breadcrumb-link:hover {
		color: var(--text);
		text-decoration: underline;
	}

	.breadcrumb-sep {
		margin: 0 var(--sp-2);
		color: var(--text-muted);
	}

	.breadcrumb-group {
		color: var(--text-muted);
	}

	.breadcrumb-current {
		color: var(--text);
	}

	/* Mobile back button */
	.back-btn {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		background: none;
		border: none;
		padding: var(--sp-2);
		margin: 0 calc(-1 * var(--sp-2)) var(--sp-3);
		color: var(--text-muted);
		cursor: pointer;
		font-size: var(--fs-sm);
		min-height: 48px;
		min-width: 48px;
		transition: color 0.15s ease;
	}

	.back-btn:hover {
		color: var(--text);
	}

	.back-btn svg {
		flex-shrink: 0;
	}

	/* Show breadcrumb on desktop/tablet, hide back button */
	@media (min-width: 900px) {
		.breadcrumb {
			display: block;
		}
		.back-btn {
			display: none;
		}
	}

	/* Hide breadcrumb on mobile, show back button */
	@media (max-width: 899px) {
		.breadcrumb {
			display: none;
		}
		.back-btn {
			display: flex;
		}
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
	@media (min-width: 1320px) {
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
	@media (min-width: 900px) and (max-width: 1319px) {
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

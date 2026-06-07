<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import { config } from '$lib/config';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import { spreadRateFromThickness } from '$lib/config/formulas';
	import { findTool, allTools, toolGroups } from '$lib/workspace/tools';
	import JobBar from '$lib/components/workspace/JobBar.svelte';
	import ToolList from '$lib/components/workspace/ToolList.svelte';
	import UnitToggle from '$lib/components/UnitToggle.svelte';
	import HomePrimaryCalcs from '$lib/components/workspace/HomePrimaryCalcs.svelte';
	import { authStore } from '$lib/stores/auth.svelte';
	import ScreedManView from '$lib/components/ScreedManView.svelte';
	import CalcHistoryLog from '$lib/components/CalcHistoryLog.svelte';
	import { recentTools } from '$lib/stores/recentTools.svelte';
	import { job } from '$lib/stores/job.svelte';

	let { data }: { data: PageData } = $props();

	const isScreedMan = $derived(authStore.org?.role === 'screed_man');
	const isLaborer = $derived(authStore.org?.role === 'laborer');
	const projectContext = $derived.by(() => {
		const ctx = data.jobContext;
		if (ctx && 'jobSite' in ctx && ctx.jobSite) {
			return { ...ctx, jobSite: ctx.jobSite };
		}
		return null;
	});
	const jobContextError = $derived(
		data.jobContext && 'error' in data.jobContext ? data.jobContext.error : null
	);

	const requestedToolId = $derived($page.url.searchParams.get('tool'));
	const activeTool = $derived.by(() => {
		if (requestedToolId) return findTool(requestedToolId);
		return projectContext ? findTool('production-check') : null;
	});
	const isHome = $derived(activeTool == null);
	const ActiveComponent = $derived(activeTool?.component);
	const activeToolGroup = $derived(toolGroups.find(g => g.tools.some(t => t.id === activeTool?.id)) ?? null);

	function selectTool(id: string) {
		recentTools.addTool(id);
		const url = new URL($page.url);
		url.searchParams.set('tool', id);
		goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	function selectHome() {
		const url = new URL($page.url);
		if (projectContext) {
			url.searchParams.set('tool', 'production-check');
		} else {
			url.searchParams.delete('tool');
		}
		goto(url, { replaceState: false, keepFocus: true, noScroll: true });
	}

	const thicknessIn = $derived(calcContext.lift_thickness.value);
	const targetRate = $derived(
		thicknessIn > 0 ? Math.round(spreadRateFromThickness(thicknessIn)) : 0
	);

	// Mobile swipe state
	let swipeOffset = $state(0);
	let showHints = $state(false);
	let historyOpen = $state(false);
	let hintTimeout: number | undefined;
	let isDraggingStage = $state(false);
	let seededJobSiteId = $state<string | null>(null);

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

	// Redirect laborer to field view once auth loads
	$effect(() => {
		if (!authStore.loading && isLaborer) {
			goto('/app/field');
		}
	});

	// Init recent tools from localStorage (browser-only)
	$effect(() => {
		recentTools.init();
	});

	$effect(() => {
		const context = projectContext;
		if (!context || seededJobSiteId === context.jobSite.id) return;

		calcContext.clearManual('road_width');
		calcContext.clearManual('lift_thickness');
		calcContext.clearManual('course_type');
		calcContext.seedFromJobSite({
			lane_width_ft: context.config?.lane_width_ft,
			target_thickness_in: context.config?.target_thickness_in,
			course_type: context.courseType
		});

		job.siteName = context.jobSite.name;
		job.siteDescription = context.jobSite.location_description ?? '';
		if (context.config?.lane_width_ft != null && context.config.lane_width_ft > 0) {
			job.widthFt = context.config.lane_width_ft;
		}
		if (
			context.config?.target_thickness_in != null &&
			context.config.target_thickness_in > 0
		) {
			job.thicknessIn = context.config.target_thickness_in;
		}
		if (context.courseType) {
			job.courseType = context.courseType;
		}
		if (context.config?.tack_type) {
			job.tackApplication = context.config.tack_type;
		}
		seededJobSiteId = context.jobSite.id;
	});

	// Resolve recent tool IDs to full Tool objects for rendering
	const recentToolList = $derived(
		recentTools.ids
			.map((id) => allTools.find((t) => t.id === id))
			.filter((t): t is NonNullable<typeof t> => t != null)
	);
</script>

<svelte:head>
	<title>{config.app.name} — Quick Calculator</title>
</svelte:head>

{#if isScreedMan}
	<ScreedManView />
{:else}
<div class="workspace">
	<JobBar />

	{#if projectContext}
		<section class="project-context" aria-label="Project calculator context">
			<div class="project-main">
				<div class="eyebrow">Project Calculator</div>
				<h2>{projectContext.jobSite.name}</h2>
				{#if projectContext.activeMix}
					<p>{projectContext.activeMix.mix_name}</p>
				{:else if projectContext.jobSite.location_description}
					<p>{projectContext.jobSite.location_description}</p>
				{/if}
			</div>
			<div class="project-facts">
				{#if projectContext.config?.lane_width_ft}
					<span><b>{projectContext.config.lane_width_ft}</b> ft width</span>
				{/if}
				{#if projectContext.config?.target_thickness_in}
					<span><b>{projectContext.config.target_thickness_in}</b>" lift</span>
				{/if}
				{#if projectContext.config?.target_spread_rate}
					<span><b>{Math.round(projectContext.config.target_spread_rate)}</b> lbs/SY</span>
				{:else}
					<span><b>{targetRate}</b> lbs/SY</span>
				{/if}
				{#if projectContext.config?.total_tonnage}
					<span><b>{Math.round(projectContext.config.total_tonnage).toLocaleString()}</b> target tons</span>
				{/if}
			</div>
			<a class="project-link" href="/dashboard/job-sites/{projectContext.jobSite.id}">Back to Project</a>
		</section>
	{:else if jobContextError}
		<section class="project-context warning" aria-label="Project calculator context unavailable">
			<div class="project-main">
				<div class="eyebrow">Project Calculator</div>
				<h2>Project context unavailable</h2>
			</div>
			<a class="project-link" href="/login">Sign in</a>
		</section>
	{/if}

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
							<div class="eyebrow">Calculators</div>
							<h1 class="stage-title">Quick Calculator</h1>
						</div>
						<UnitToggle />
					</div>
				</header>

				<div class="stage-body">
					{#if recentToolList.length > 0}
						<section class="recent-tools-section" aria-label="Your recent tools">
							<div class="eyebrow">Your Recent Tools</div>
							<div class="recent-chips">
								{#each recentToolList as tool (tool.id)}
									<button
										type="button"
										class="recent-chip"
										onclick={() => selectTool(tool.id)}
									>
										{tool.label}
									</button>
								{/each}
							</div>
						</section>
					{/if}

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
						<button type="button" class="breadcrumb-link" onclick={selectHome}>Quick Calculator</button>
						<span class="breadcrumb-sep">/</span>
						{#if activeToolGroup}
							<span class="breadcrumb-group">{activeToolGroup.label}</span>
							<span class="breadcrumb-sep">/</span>
						{/if}
						<span class="breadcrumb-current">{activeTool?.label ?? ''}</span>
					</nav>

					<!-- Mobile back button -->
					<button type="button" class="back-btn" onclick={selectHome} aria-label="Back to quick calculator">
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

	.project-context {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--sp-4);
		padding: var(--sp-3) var(--sp-4);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
	}

	.project-context.warning {
		border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
	}

	.project-main {
		min-width: 0;
	}

	.project-main h2 {
		margin: 2px 0 0;
		font-size: var(--fs-lg);
		line-height: 1.2;
	}

	.project-main p {
		margin: 4px 0 0;
		color: var(--text-muted);
		font-size: var(--fs-sm);
	}

	.project-facts {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--sp-2);
		flex-wrap: wrap;
		margin-left: auto;
	}

	.project-facts span {
		display: inline-flex;
		align-items: baseline;
		gap: 4px;
		min-height: 32px;
		padding: 6px 9px;
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-muted);
		font-size: var(--fs-sm);
		background: var(--surface-alt);
	}

	.project-facts b {
		color: var(--text);
	}

	.project-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 40px;
		padding: 0 var(--sp-3);
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text);
		font-size: var(--fs-sm);
		font-weight: var(--fw-semibold);
		text-decoration: none;
		white-space: nowrap;
	}

	.project-link:hover {
		border-color: var(--accent);
	}

	/* ── Calc History Section ───────────────────────────────────────────── */
	.history-section {
		margin-top: 1.5rem;
	}

	/* ── Recent Tools Chips ─────────────────────────────────────────────── */
	.recent-tools-section {
		margin-bottom: 1.25rem;
	}

	.recent-tools-section .eyebrow {
		margin-bottom: 0.5rem;
	}

	.recent-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.recent-chip {
		display: inline-flex;
		align-items: center;
		min-height: 48px;
		padding: 0 1.1rem;
		background: var(--surface-alt);
		border: 1px solid var(--accent);
		border-radius: 999px;
		color: var(--accent);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, border-color 0.15s, color 0.15s;
		white-space: nowrap;
	}

	.recent-chip:hover,
	.recent-chip:focus-visible {
		background: var(--accent);
		color: var(--accent-text);
		outline: none;
	}

	.history-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		min-height: 48px;
		padding: 0.75rem 1rem;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		text-align: left;
		transition: background 0.15s, border-color 0.15s;
	}
	.history-toggle:hover {
		background: var(--surface-hover);
		border-color: var(--border);
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
	/* Mobile: tool picker sits at the top as a horizontal chip menu (see ToolList),
	   then the active calculator. */
	@media (max-width: 899px) {
		.project-context {
			align-items: stretch;
			flex-direction: column;
		}

		.project-facts {
			justify-content: flex-start;
			margin-left: 0;
		}

		.project-link {
			width: 100%;
		}

		.tools {
			margin: 0 calc(-1 * var(--sp-4));
			padding: var(--sp-2) var(--sp-4);
			border-bottom: 1px solid var(--border);
		}
	}

	.tools-header {
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

	/* Desktop: tool list | stage */
	@media (min-width: 1320px) {
		.panes {
			display: grid;
			grid-template-columns: var(--toollist-w) minmax(0, 900px);
			gap: var(--sp-6);
			align-items: start;
			justify-content: center;
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
		}
		.stage-head {
			position: sticky;
			top: 0;
			background: var(--bg);
			z-index: 2;
			padding-bottom: var(--sp-3);
		}
	}

	/* Tablet: tool list + stage */
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
	}
</style>

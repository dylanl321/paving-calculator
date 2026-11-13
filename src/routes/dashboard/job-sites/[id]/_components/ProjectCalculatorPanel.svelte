<!--
	ProjectCalculatorPanel — the in-context calculator for a project's Production
	tab. Renders the project-relevant (Asphalt) calculators inline, pre-filled from
	the project (the detail page already seeds calcContext via seedFromJobSite), so
	field calcs happen INSIDE the job instead of redirecting out to /app Quick Calc.

	The shared calculator cards (ProductionCheckCard, etc.) are pure — they read
	calcContext (already seeded from this project by the detail page) and compute
	live. History persists separately via the saved-calculations list.
-->
<script lang="ts">
	import { toolGroups, type Tool } from '$lib/workspace/tools';
	import { calcContext } from '$lib/stores/calcContext.svelte';
	import SourceTag from '$lib/components/SourceTag.svelte';

	// Every calculator group the app already ships. Tack stays its own tool
	// inside Asphalt. Base stone is Soil & Subgrade. There is no separate
	// milling card in the calculator set.
	const PROJECT_GROUPS = ['asphalt', 'soil', 'concrete', 'grading', 'specialty'];
	const groups = $derived(toolGroups.filter((group) => PROJECT_GROUPS.includes(group.id)));

	let groupId = $state('asphalt');
	const activeGroup = $derived(groups.find((group) => group.id === groupId) ?? groups[0]);
	const tools = $derived(activeGroup?.tools ?? []);

	let activeToolId = $state<string>('production-check');
	const activeTool = $derived<Tool | null>(
		tools.find((t) => t.id === activeToolId) ?? tools[0] ?? null
	);
	const ActiveComponent = $derived(activeTool?.component);

	function selectTool(id: string) {
		activeToolId = id;
	}
</script>

<div class="calc-panel">
	<div class="context-banner">
		<div class="context-header">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
				<circle cx="12" cy="12" r="10"></circle>
				<line x1="12" y1="16" x2="12" y2="12"></line>
				<line x1="12" y1="8" x2="12.01" y2="8"></line>
			</svg>
			<span>Calculating for this project</span>
		</div>
		<div class="context-values">
			<div class="context-item">
				<span class="context-label">Road Width</span>
				<span class="context-value">{calcContext.road_width.value} ft</span>
				<SourceTag source={calcContext.road_width.source} updatedAt={calcContext.road_width.updatedAt} label="Road Width" />
			</div>
			<div class="context-item">
				<span class="context-label">Lift Thickness</span>
				<span class="context-value">{calcContext.lift_thickness.value} in</span>
				<SourceTag source={calcContext.lift_thickness.source} updatedAt={calcContext.lift_thickness.updatedAt} label="Lift Thickness" />
			</div>
			<div class="context-item">
				<span class="context-label">Course Type</span>
				<span class="context-value">{calcContext.course_type.value}</span>
				<SourceTag source={calcContext.course_type.source} updatedAt={calcContext.course_type.updatedAt} label="Course Type" />
			</div>
		</div>
	</div>

	<nav class="tool-picker" aria-label="Calculator groups">
		{#each groups as group (group.id)}
			<button
				type="button"
				class="tool-chip"
				class:active={group.id === activeGroup?.id}
				aria-current={group.id === activeGroup?.id ? 'true' : undefined}
				onclick={() => {
					groupId = group.id;
					activeToolId = group.tools[0]?.id ?? activeToolId;
				}}
			>
				<span class="tool-chip-label">{group.label}</span>
			</button>
		{/each}
	</nav>

	<nav class="tool-picker" aria-label="Calculators">
		{#each tools as tool (tool.id)}
			<button
				type="button"
				class="tool-chip"
				class:active={tool.id === activeToolId}
				aria-current={tool.id === activeToolId ? 'true' : undefined}
				onclick={() => selectTool(tool.id)}
			>
				<span class="tool-chip-label">{tool.label}</span>
				<span class="tool-chip-blurb">{tool.blurb}</span>
			</button>
		{/each}
	</nav>

	<div class="calc-stage">
		{#if ActiveComponent}
			<ActiveComponent />
		{/if}
	</div>
</div>

<style>
	.calc-panel {
		display: flex;
		flex-direction: column;
		gap: var(--sp-4);
	}

	.context-banner {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		padding: var(--sp-4);
	}

	.context-header {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		margin-bottom: var(--sp-3);
		font-size: var(--fs-xs);
		font-weight: var(--fw-bold);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.context-header svg {
		color: var(--accent);
	}

	.context-values {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.context-item {
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		min-width: 0;
		flex-wrap: wrap;
		font-size: var(--fs-sm);
	}

	.context-label {
		color: var(--text-muted);
	}

	.context-value {
		font-weight: var(--fw-semibold);
		color: var(--text);
	}

	.tool-picker {
		display: flex;
		gap: var(--sp-2);
		overflow-x: auto;
		padding-bottom: var(--sp-1);
		-webkit-overflow-scrolling: touch;
	}

	.tool-chip {
		display: flex;
		flex-direction: column;
		gap: 2px;
		align-items: flex-start;
		text-align: left;
		min-height: var(--touch);
		padding: var(--sp-2) var(--sp-3);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md);
		color: var(--text);
		cursor: pointer;
		white-space: nowrap;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);
	}

	.tool-chip:hover {
		border-color: var(--accent);
	}

	.tool-chip.active {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 12%, var(--surface));
	}

	.tool-chip-label {
		font-weight: var(--fw-semibold);
		font-size: var(--fs-sm);
	}

	.tool-chip-blurb {
		font-size: var(--fs-2xs);
		color: var(--text-muted);
	}

	.calc-stage {
		min-width: 0;
	}

	@media (min-width: 900px) {
		.context-values {
			flex-direction: row;
			justify-content: space-between;
		}

		.context-item {
			flex: 1;
		}
	}
</style>

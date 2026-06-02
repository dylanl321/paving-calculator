<script lang="ts">
	import { toolGroups } from '$lib/workspace/tools';

	interface Props {
		activeId: string;
		onselect: (id: string) => void;
	}

	let { activeId, onselect }: Props = $props();
</script>

<nav class="tool-list" aria-label="Calculators">
	{#each toolGroups as group (group.id)}
		<div class="group">
			<div class="eyebrow group-label">{group.label}</div>
			<ul>
				{#each group.tools as tool (tool.id)}
					<li>
						<button
							type="button"
							class="tool"
							class:active={activeId === tool.id}
							aria-current={activeId === tool.id ? 'true' : undefined}
							onclick={() => onselect(tool.id)}
						>
							<span class="tool-label">{tool.label}</span>
							<span class="tool-blurb">{tool.blurb}</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/each}
</nav>

<style>
	.tool-list {
		display: flex;
		flex-direction: column;
		gap: var(--sp-5);
	}

	.group-label {
		margin-bottom: var(--sp-2);
		padding: 0 var(--sp-2);
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.tool {
		width: 100%;
		text-align: left;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--sp-2) var(--sp-3);
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		cursor: pointer;
		transition:
			background var(--dur) var(--ease),
			border-color var(--dur) var(--ease);
	}

	.tool:hover {
		background: var(--surface-hover);
	}

	.tool.active {
		background: var(--surface);
		border-color: var(--border);
		box-shadow: inset 3px 0 0 var(--accent);
	}

	.tool-label {
		font-size: var(--fs-md);
		font-weight: var(--fw-semibold);
	}

	.tool.active .tool-label {
		color: var(--accent);
	}

	.tool-blurb {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		line-height: 1.3;
	}
</style>

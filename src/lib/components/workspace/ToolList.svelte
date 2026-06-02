<script lang="ts">
	import { toolGroups } from '$lib/workspace/tools';
	import { today } from '$lib/stores/today.svelte';

	interface Props {
		activeId: string;
		todayActive?: boolean;
		onselect: (id: string) => void;
		onselecttoday?: () => void;
	}

	let { activeId, todayActive = false, onselect, onselecttoday }: Props = $props();
</script>

<nav class="tool-list" aria-label="Calculators">
	{#if onselecttoday}
		<div class="group">
			<button
				type="button"
				class="tool today-tool"
				class:active={todayActive}
				aria-current={todayActive ? 'true' : undefined}
				onclick={onselecttoday}
			>
				<span class="tool-label">Today</span>
				<span class="tool-blurb">
					{today.entryCount > 0
						? `${today.entryCount} ${today.entryCount === 1 ? 'entry' : 'entries'} logged`
						: "Today's production record"}
				</span>
			</button>
		</div>
	{/if}
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
			background var(--dur-normal) var(--ease),
			border-color var(--dur-normal) var(--ease),
			transform var(--dur-fast) var(--ease);
	}

	@media (prefers-reduced-motion: no-preference) {
		.tool:active {
			transform: scale(0.98);
		}
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

	.today-tool {
		border: 1px solid var(--border);
		background: var(--surface);
	}
	.today-tool.active {
		box-shadow: inset 3px 0 0 var(--accent);
	}

	.tool-blurb {
		font-size: var(--fs-xs);
		color: var(--text-muted);
		line-height: 1.3;
	}

	/* Mobile: present the picker as a compact horizontal chip menu so it can sit
	   at the top of the page without taking a full screen of vertical space. */
	@media (max-width: 767px) {
		.tool-list {
			flex-direction: row;
			gap: var(--sp-3);
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
			padding-bottom: var(--sp-2);
			scroll-snap-type: x proximity;
		}
		.tool-list::-webkit-scrollbar {
			height: 4px;
		}
		.tool-list::-webkit-scrollbar-thumb {
			background: var(--border);
			border-radius: 4px;
		}

		.group {
			display: flex;
			flex-direction: column;
			gap: var(--sp-1, 4px);
			flex: 0 0 auto;
		}
		.group-label {
			margin-bottom: 0;
			white-space: nowrap;
		}

		ul {
			flex-direction: row;
			gap: var(--sp-2);
		}

		.tool {
			width: auto;
			flex: 0 0 auto;
			min-height: 44px;
			justify-content: center;
			padding: var(--sp-2) var(--sp-3);
			border: 1px solid var(--border);
			border-radius: var(--radius-pill);
			background: var(--surface);
			white-space: nowrap;
			scroll-snap-align: start;
		}
		.tool.active {
			box-shadow: none;
			border-color: var(--accent);
			background: color-mix(in srgb, var(--accent) 14%, var(--surface));
		}
		/* The blurb is too verbose for chips — show labels only on mobile */
		.tool-blurb {
			display: none;
		}
		.today-tool .tool-blurb {
			display: none;
		}
	}
</style>

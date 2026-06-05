<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import type { NavItem } from './navConfig';
	import NavIcon from './NavIcon.svelte';

	let {
		items,
		activeHref,
		expanded,
		onToggleExpanded
	}: {
		items: NavItem[];
		activeHref: string | null;
		expanded: Record<string, boolean>;
		onToggleExpanded: (item: NavItem) => void;
	} = $props();

	function isActive(item: NavItem): boolean {
		return activeHref === item.href;
	}

	function hasActiveChild(item: NavItem): boolean {
		return (item.children ?? []).some(
			(child) => isActive(child) || hasActiveChild(child)
		);
	}

	function isExpanded(item: NavItem): boolean {
		if (item.href in expanded) return expanded[item.href];
		return hasActiveChild(item);
	}
</script>

<ul class="nav-list">
	{#each items as item (item.href)}
		{@const childrenVisible = item.children && item.children.length > 0}
		<li>
			{#if childrenVisible}
				<div class="nav-row">
					<a
						href={item.href}
						class="nav-link"
						class:active={isActive(item)}
						class:active-child={!isActive(item) && hasActiveChild(item)}
						title={item.label}
						aria-current={isActive(item) ? 'page' : undefined}
					>
						<span class="nav-icon" aria-hidden="true">
							<NavIcon icon={item.icon} />
						</span>
						<span class="nav-label">{item.label}</span>
					</a>
					<button
						type="button"
						class="nav-expand"
						class:expanded={isExpanded(item)}
						onclick={() => onToggleExpanded(item)}
						aria-expanded={isExpanded(item)}
						aria-label={`${isExpanded(item) ? 'Collapse' : 'Expand'} ${item.label}`}
					>
						<ChevronDown size={18} aria-hidden="true" />
					</button>
				</div>
				{#if isExpanded(item)}
					<ul class="nav-sublist">
						{#each item.children ?? [] as child (child.href)}
							<li>
								<a
									href={child.href}
									class="nav-link nav-sublink"
									class:active={isActive(child)}
									title={child.label}
									aria-current={isActive(child) ? 'page' : undefined}
								>
									<span class="nav-icon" aria-hidden="true">
										<NavIcon icon={child.icon} />
									</span>
									<span class="nav-label">{child.label}</span>
								</a>
							</li>
						{/each}
					</ul>
				{/if}
			{:else}
				<a
					href={item.href}
					class="nav-link"
					class:active={isActive(item)}
					title={item.label}
					aria-current={isActive(item) ? 'page' : undefined}
				>
					<span class="nav-icon" aria-hidden="true">
						<NavIcon icon={item.icon} />
					</span>
					<span class="nav-label">{item.label}</span>
				</a>
			{/if}
		</li>
	{/each}
</ul>

<style>
	.nav-list {
		list-style: none;
		margin: 0;
		padding: 12px 10px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}
	.nav-link {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 0 14px;
		min-height: 48px;
		border-radius: 10px;
		color: var(--text-muted);
		font-weight: 600;
		font-size: 0.95rem;
		transition: background var(--dur-normal) var(--ease), color var(--dur-normal) var(--ease);
	}
	.nav-link:hover { background: var(--surface-hover); color: var(--text); }
	.nav-link.active { background: var(--accent); color: var(--accent-text); }
	.nav-link.active-child { color: var(--text); background: var(--surface-hover); }

	.nav-row { display: flex; align-items: center; gap: 4px; }
	.nav-row .nav-link { flex: 1; min-width: 0; }

	.nav-expand {
		display: flex;
		align-items: center;
		justify-content: center;
		min-width: 48px;
		min-height: 48px;
		background: none;
		border: 0;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 10px;
		transition: background var(--dur-normal) var(--ease), color var(--dur-normal) var(--ease);
	}
	.nav-expand:hover { background: var(--surface-hover); color: var(--text); }
	.nav-expand :global(svg) { transition: transform var(--dur-normal) var(--ease); }
	.nav-expand.expanded :global(svg) { transform: rotate(180deg); }

	.nav-sublist {
		list-style: none;
		margin: 4px 0;
		padding: 0 0 0 18px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		border-left: 2px solid var(--border);
	}
	.nav-sublink { min-height: 44px; font-size: 0.9rem; font-weight: 500; }
	.nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
	.nav-icon :global(svg) { width: 22px; height: 22px; }

	@media (min-width: 900px) and (max-width: 1099px) {
		.nav-link { justify-content: center; padding: 0; }
		.nav-label { display: none; }
		.nav-row { gap: 0; }
		.nav-expand { display: none; }
		.nav-sublist { margin: 4px 0; padding: 0; border-left: 0; gap: 4px; }
		.nav-sublink { min-height: 48px; }
	}

	@media (min-width: 1100px) {
		.nav-link { justify-content: flex-start; padding: 0 14px; }
		.nav-label { display: inline; }
	}

	@media (min-width: 1100px) {
		:global(.sidebar.nav-collapsed) .nav-link { justify-content: center; padding: 0; }
		:global(.sidebar.nav-collapsed) .nav-label { display: none; }
		:global(.sidebar.nav-collapsed) .nav-row { gap: 0; }
		:global(.sidebar.nav-collapsed) .nav-expand { display: none; }
		:global(.sidebar.nav-collapsed) .nav-sublist { margin: 4px 0; padding: 0; border-left: 0; gap: 4px; }
		:global(.sidebar.nav-collapsed) .nav-sublink { min-height: 48px; }
	}

	@media (max-height: 720px) and (min-width: 900px) {
		.nav-list {
			padding: 8px;
			gap: 2px;
		}

		.nav-link,
		.nav-expand {
			min-height: 42px;
		}

		.nav-sublink {
			min-height: 38px;
		}

		.nav-icon :global(svg) {
			width: 20px;
			height: 20px;
		}
	}
</style>

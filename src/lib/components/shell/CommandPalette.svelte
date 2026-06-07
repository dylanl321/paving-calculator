<script lang="ts">
	import { goto } from '$app/navigation';
	import { tick } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { authStore } from '$lib/stores/auth.svelte';
	import { navItems, isItemVisible, type NavItem, type NavAuthContext } from './navConfig';
	import {
		Calculator,
		BookOpen,
		BookMarked,
		LayoutDashboard,
		Clock,
		Upload,
		Users,
		Settings,
		Map as MapIcon,
		Search,
		CornerDownLeft,
		FolderKanban,
		Building2,
		GraduationCap,
		ShieldCheck
	} from 'lucide-svelte';

	function flattenItems(items: NavItem[]): NavItem[] {
		return items.flatMap((item) => [item, ...flattenItems(item.children ?? [])]);
	}

	const authContext = $derived<NavAuthContext>({
		role: authStore.org?.role,
		isAuthenticated: authStore.isAuthenticated,
		canAccessAdmin: authStore.canAccessAdmin
	});

	let open = $state(false);
	let query = $state('');
	let selectedIdx = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	// Flatten the shared nav tree and run every entry (parents + children)
	// through the SAME visibility predicate the sidebar uses, so gated links
	// (admin, field-only) never leak into ⌘K. A parent whose group is hidden
	// also hides its children. Deduplicate by href (group parents can share an
	// href with a child) keeping the most specific (last) label.
	const visibleFlat = $derived.by(() => {
		const flat = flattenItems(
			navItems.filter((item) => isItemVisible(item, authContext))
		).filter((item) => isItemVisible(item, authContext));
		const byHref = new Map<string, NavItem>();
		for (const item of flat) byHref.set(item.href, item);
		return [...byHref.values()];
	});

	const filtered = $derived(
		query.trim() === ''
			? visibleFlat
			: visibleFlat.filter((item) =>
					item.label.toLowerCase().includes(query.trim().toLowerCase())
				)
	);

	$effect(() => {
		// reset selection when results change
		if (filtered) selectedIdx = 0;
	});

	export function openPalette() {
		open = true;
		query = '';
		selectedIdx = 0;
		tick().then(() => inputEl?.focus());
	}

	function closePalette() {
		open = false;
		query = '';
	}

	function navigate(href: string) {
		closePalette();
		goto(href);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			closePalette();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			selectedIdx = Math.min(selectedIdx + 1, filtered.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			selectedIdx = Math.max(selectedIdx - 1, 0);
		} else if (e.key === 'Enter') {
			e.preventDefault();
			if (filtered[selectedIdx]) navigate(filtered[selectedIdx].href);
		}
	}

	function handleGlobalKeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
			e.preventDefault();
			if (open) {
				closePalette();
			} else {
				openPalette();
			}
		}
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if open}
	<!-- Scrim -->
	<button
		class="cmd-scrim"
		onclick={closePalette}
		aria-label="Close command palette"
		tabindex="-1"
		transition:fade={{ duration: 180 }}
	></button>

	<!-- Palette -->
	<div
		class="cmd-palette"
		role="dialog"
		aria-label="Command palette"
		aria-modal="true"
		transition:scale={{ duration: 160, start: 0.96 }}
	>
		<div class="cmd-search-row">
			<Search size={18} class="cmd-search-icon" aria-hidden="true" />
			<input
				bind:this={inputEl}
				bind:value={query}
				onkeydown={handleKeydown}
				class="cmd-input"
				type="text"
				placeholder="Search pages..."
				autocomplete="off"
				spellcheck={false}
				aria-label="Search"
				aria-autocomplete="list"
				aria-controls="cmd-results"
				aria-activedescendant={filtered[selectedIdx] ? `cmd-item-${selectedIdx}` : undefined}
			/>
			<kbd class="cmd-esc-hint">Esc</kbd>
		</div>

		<ul class="cmd-results" id="cmd-results" role="listbox">
			{#if filtered.length === 0}
				<li class="cmd-empty">No results</li>
			{:else}
				{#each filtered as item, i (item.href)}
					<li
						id="cmd-item-{i}"
						role="option"
						aria-selected={i === selectedIdx}
						class="cmd-item"
						class:selected={i === selectedIdx}
						onmouseenter={() => (selectedIdx = i)}
					>
						<button class="cmd-item-btn" onclick={() => navigate(item.href)}>
							<span class="cmd-item-icon" aria-hidden="true">
								{#if item.icon === 'calc'}
									<Calculator size={18} />
								{:else if item.icon === 'book'}
									<BookOpen size={18} />
								{:else if item.icon === 'guide'}
									<BookMarked size={18} />
								{:else if item.icon === 'layout'}
									<LayoutDashboard size={18} />
								{:else if item.icon === 'upload'}
									<Upload size={18} />
								{:else if item.icon === 'clock'}
									<Clock size={18} />
								{:else if item.icon === 'map'}
									<MapIcon size={18} />
								{:else if item.icon === 'users'}
									<Users size={18} />
								{:else if item.icon === 'settings'}
									<Settings size={18} />
								{:else if item.icon === 'folder'}
									<FolderKanban size={18} />
								{:else if item.icon === 'org'}
									<Building2 size={18} />
								{:else if item.icon === 'learn'}
									<GraduationCap size={18} />
								{:else if item.icon === 'shield-check'}
									<ShieldCheck size={18} />
								{/if}
							</span>
							<span class="cmd-item-label">{item.label}</span>
							{#if i === selectedIdx}
								<CornerDownLeft size={14} class="cmd-enter-hint" aria-hidden="true" />
							{/if}
						</button>
					</li>
				{/each}
			{/if}
		</ul>

		<div class="cmd-footer">
			<span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
			<span><kbd>↵</kbd> go</span>
			<span><kbd>Esc</kbd> close</span>
		</div>
	</div>
{/if}

<style>
	.cmd-scrim {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		border: 0;
		z-index: 100;
		cursor: default;
	}

	.cmd-palette {
		position: fixed;
		top: 15vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(560px, calc(100vw - 32px));
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 14px;
		box-shadow:
			0 24px 64px rgba(0, 0, 0, 0.45),
			0 4px 16px rgba(0, 0, 0, 0.2);
		z-index: 101;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}

	.cmd-search-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 14px 16px;
		border-bottom: 1px solid var(--border);
	}

	.cmd-search-row :global(.cmd-search-icon) {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.cmd-input {
		flex: 1;
		background: none;
		border: 0;
		outline: none;
		color: var(--text);
		font-size: 1rem;
		font-family: inherit;
		min-width: 0;
	}

	.cmd-input::placeholder {
		color: var(--text-muted);
	}

	.cmd-esc-hint {
		font-size: 0.72rem;
		color: var(--text-muted);
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 2px 6px;
		flex-shrink: 0;
	}

	.cmd-results {
		list-style: none;
		margin: 0;
		padding: 6px;
		max-height: 360px;
		overflow-y: auto;
	}

	.cmd-empty {
		padding: 20px 16px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.cmd-item {
		border-radius: 8px;
	}

	.cmd-item.selected {
		background: var(--surface-hover);
	}

	.cmd-item-btn {
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 48px;
		padding: 0 12px;
		background: none;
		border: 0;
		color: var(--text);
		cursor: pointer;
		font-size: 0.95rem;
		font-family: inherit;
		border-radius: 8px;
		text-align: left;
		transition: background var(--dur-fast, 100ms) ease;
	}

	.cmd-item.selected .cmd-item-btn {
		background: var(--surface-hover);
	}

	.cmd-item-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.cmd-item-label {
		flex: 1;
		text-align: left;
	}

	.cmd-item-btn :global(.cmd-enter-hint) {
		color: var(--text-muted);
		flex-shrink: 0;
	}

	.cmd-footer {
		display: flex;
		gap: 16px;
		padding: 8px 16px;
		border-top: 1px solid var(--border);
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.cmd-footer kbd {
		display: inline-block;
		background: var(--surface-alt);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 1px 5px;
		font-family: inherit;
		font-size: 0.7rem;
	}
</style>

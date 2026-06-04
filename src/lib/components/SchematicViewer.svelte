<script lang="ts">
	interface Schematic {
		id: string;
		page_number: number | null;
		label: string | null;
	}

	let {
		jobSiteId,
		schematics
	}: {
		jobSiteId: string;
		schematics: Schematic[];
	} = $props();

	let activeIndex = $state(0);
	let fullscreen = $state(false);
	let zoom = $state(1);

	const active = $derived(schematics[activeIndex] ?? null);

	function src(s: Schematic): string {
		return `/api/job-sites/${jobSiteId}/schematics/${s.id}/view`;
	}

	function labelFor(s: Schematic): string {
		return s.label ?? `Sheet ${s.page_number ?? ''}`;
	}

	function go(delta: number) {
		const next = activeIndex + delta;
		if (next < 0 || next >= schematics.length) return;
		activeIndex = next;
		zoom = 1;
	}

	function select(i: number) {
		activeIndex = i;
		zoom = 1;
	}

	function openFullscreen() {
		fullscreen = true;
		zoom = 1;
	}

	function closeFullscreen() {
		fullscreen = false;
		zoom = 1;
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') go(1);
		else if (e.key === 'ArrowLeft') go(-1);
		else if (e.key === 'Escape' && fullscreen) closeFullscreen();
	}

	let mounted = $state(false);

	$effect(() => {
		// Scroll the active thumbnail into view WITHIN the filmstrip only — never
		// scroll the page. Skip the initial mount so opening the Overview doesn't
		// yank the viewport (the reported "weird auto-scroll").
		const idx = activeIndex;
		if (typeof document === 'undefined') return;
		if (!mounted) {
			mounted = true;
			return;
		}
		const el = document.querySelector<HTMLElement>(`[data-thumb="${idx}"]`);
		const strip = el?.parentElement;
		if (!el || !strip) return;
		// Horizontal-only scroll of the filmstrip container; no page movement.
		const target = el.offsetLeft - strip.clientWidth / 2 + el.clientWidth / 2;
		strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
	});
</script>

<svelte:window onkeydown={handleKey} />

{#if active}
	<div class="viewer">
		<div class="stage">
			<button
				class="nav-btn prev"
				onclick={() => go(-1)}
				disabled={activeIndex === 0}
				aria-label="Previous sheet"
			>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
			</button>

			<button class="stage-image" onclick={openFullscreen} aria-label="Open full screen">
				<img src={src(active)} alt={labelFor(active)} />
				<span class="zoom-hint">Click to enlarge</span>
			</button>

			<button
				class="nav-btn next"
				onclick={() => go(1)}
				disabled={activeIndex === schematics.length - 1}
				aria-label="Next sheet"
			>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
			</button>
		</div>

		<div class="stage-caption">
			<span class="caption-label">{labelFor(active)}</span>
			<span class="caption-count">{activeIndex + 1} / {schematics.length}</span>
		</div>

		<div class="filmstrip">
			{#each schematics as s, i (s.id)}
				<button
					class="thumb"
					class:active={i === activeIndex}
					data-thumb={i}
					onclick={() => select(i)}
					title={labelFor(s)}
				>
					<img src={src(s)} alt={labelFor(s)} loading="lazy" />
					<span class="thumb-label">{labelFor(s)}</span>
				</button>
			{/each}
		</div>
	</div>
{/if}

{#if fullscreen && active}
	<dialog class="fs" open onclick={closeFullscreen}>
		<div class="fs-bar" onclick={(e) => e.stopPropagation()}>
			<span class="fs-title">{labelFor(active)} · {activeIndex + 1}/{schematics.length}</span>
			<div class="fs-tools">
				<button onclick={() => (zoom = Math.max(1, zoom - 0.5))} aria-label="Zoom out">−</button>
				<span class="fs-zoom">{Math.round(zoom * 100)}%</span>
				<button onclick={() => (zoom = Math.min(5, zoom + 0.5))} aria-label="Zoom in">+</button>
				<button class="fs-close" onclick={closeFullscreen} aria-label="Close">✕</button>
			</div>
		</div>
		<div class="fs-stage" onclick={(e) => e.stopPropagation()}>
			<button class="fs-nav prev" onclick={() => go(-1)} disabled={activeIndex === 0} aria-label="Previous">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
			</button>
			<div class="fs-scroll">
				<img src={src(active)} alt={labelFor(active)} style="transform: scale({zoom});" />
			</div>
			<button class="fs-nav next" onclick={() => go(1)} disabled={activeIndex === schematics.length - 1} aria-label="Next">
				<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
			</button>
		</div>
	</dialog>
{/if}

<style>
	.viewer {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.stage {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.stage-image {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		justify-content: center;
		align-items: center;
		background: #fff;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 8px;
		cursor: zoom-in;
		max-height: 520px;
		overflow: hidden;
	}

	.stage-image img {
		max-width: 100%;
		max-height: 500px;
		object-fit: contain;
		display: block;
	}

	.zoom-hint {
		position: absolute;
		bottom: 10px;
		right: 12px;
		background: rgba(0, 0, 0, 0.6);
		color: #fff;
		font-size: 0.72rem;
		padding: 3px 8px;
		border-radius: 999px;
		opacity: 0;
		transition: opacity 0.2s;
	}

	.stage-image:hover .zoom-hint {
		opacity: 1;
	}

	.nav-btn {
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
		transition: border-color 0.2s, color 0.2s, opacity 0.2s;
	}

	.nav-btn:hover:not(:disabled) {
		border-color: var(--accent);
		color: var(--accent);
	}

	.nav-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.stage-caption {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 0 4px;
	}

	.caption-label {
		font-weight: 600;
		font-size: 0.95rem;
		color: var(--text);
	}

	.caption-count {
		font-size: 0.82rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.filmstrip {
		display: flex;
		gap: 8px;
		overflow-x: auto;
		padding-bottom: 6px;
		scrollbar-width: thin;
	}

	.thumb {
		flex: 0 0 auto;
		width: 96px;
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 0;
		background: var(--surface);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		cursor: pointer;
		transition: border-color 0.15s, transform 0.1s;
	}

	.thumb:hover {
		transform: translateY(-1px);
	}

	.thumb.active {
		border-color: var(--accent);
	}

	.thumb img {
		width: 100%;
		aspect-ratio: 8.5 / 11;
		object-fit: cover;
		object-position: top;
		background: #fff;
		display: block;
	}

	.thumb-label {
		font-size: 0.66rem;
		color: var(--text-muted);
		padding: 0 4px 5px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: center;
	}

	.thumb.active .thumb-label {
		color: var(--accent);
		font-weight: 600;
	}

	/* Fullscreen */
	.fs {
		position: fixed;
		inset: 0;
		width: 100vw;
		height: 100vh;
		max-width: 100vw;
		max-height: 100vh;
		margin: 0;
		border: none;
		padding: 0;
		background: rgba(0, 0, 0, 0.92);
		display: flex;
		flex-direction: column;
		z-index: 2000;
	}

	.fs-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 16px;
		color: #fff;
	}

	.fs-title {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.fs-tools {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.fs-tools button {
		min-width: 40px;
		min-height: 40px;
		border: 1px solid rgba(255, 255, 255, 0.3);
		background: transparent;
		color: #fff;
		border-radius: var(--radius);
		font-size: 1.1rem;
		cursor: pointer;
	}

	.fs-tools button:hover {
		background: rgba(255, 255, 255, 0.12);
	}

	.fs-zoom {
		color: #fff;
		font-size: 0.85rem;
		min-width: 48px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.fs-stage {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 0;
		padding: 0 12px 16px;
	}

	.fs-scroll {
		flex: 1;
		height: 100%;
		overflow: auto;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.fs-scroll img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		transform-origin: center center;
		transition: transform 0.15s;
	}

	.fs-nav {
		flex-shrink: 0;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		border: 1px solid rgba(255, 255, 255, 0.3);
		background: rgba(255, 255, 255, 0.08);
		color: #fff;
		cursor: pointer;
	}

	.fs-nav:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.18);
	}

	.fs-nav:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.zoom-hint {
			display: none;
		}
		.stage-image {
			max-height: 360px;
		}
		.stage-image img {
			max-height: 344px;
		}
	}
</style>

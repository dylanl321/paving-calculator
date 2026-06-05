<script lang="ts">
	let { county }: { county: string } = $props();

	interface ConstructionProject {
		projectNumber: string | null;
		description: string | null;
		county: string | null;
		district: string | null;
		projectType: string | null;
		route: string | null;
		letDate: number | null;
		compDate: number | null;
		latitude: number | null;
		longitude: number | null;
	}

	let projects = $state<ConstructionProject[]>([]);
	let loading = $state(false);
	let loaded = $state(false);
	let expanded = $state(false);
	let error = $state<string | null>(null);

	async function load() {
		if (loaded || loading) return;
		loading = true;
		error = null;
		try {
			const res = await fetch(
				`/api/gdot/construction-projects?county=${encodeURIComponent(county)}`
			);
			if (res.ok) {
				projects = await res.json();
			} else {
				error = 'Unable to load projects';
			}
		} catch {
			error = 'Unable to load projects';
		} finally {
			loading = false;
			loaded = true;
		}
	}

	function toggle() {
		expanded = !expanded;
		if (expanded) load();
	}

	function formatDate(epochMs: number | null): string {
		if (!epochMs) return '';
		// ArcGIS epoch is milliseconds since 1970
		const d = new Date(epochMs);
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
	}
</script>

<section class="panel nearby-gdot-panel">
	<button class="panel-head panel-toggle" type="button" onclick={toggle}>
		<h3>Nearby GDOT Projects</h3>
		<span class="county-badge">{county}</span>
		<svg
			class="chevron"
			class:rotated={expanded}
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		>
			<polyline points="6 9 12 15 18 9"></polyline>
		</svg>
	</button>

	{#if expanded}
		<div class="panel-body">
			{#if loading}
				<div class="skeleton-row"></div>
				<div class="skeleton-row short"></div>
			{:else if error}
				<p class="muted">{error}</p>
			{:else if projects.length === 0}
				<p class="muted">No active GDOT paving projects found in {county} County.</p>
			{:else}
				<ul class="project-list">
					{#each projects as p}
						<li class="project-card">
							<div class="project-header">
								<span class="project-num">{p.projectNumber || 'N/A'}</span>
								{#if p.route}
									<span class="project-route">{p.route}</span>
								{/if}
							</div>
							{#if p.description}
								<div class="project-desc">{p.description}</div>
							{/if}
							<div class="project-meta-row">
								{#if p.projectType}
									<span class="tag">{p.projectType}</span>
								{/if}
								{#if p.letDate}
									<span class="meta-item">Let: {formatDate(p.letDate)}</span>
								{/if}
								{#if p.compDate}
									<span class="meta-item">Est. complete: {formatDate(p.compDate)}</span>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			<p class="source-note">Source: GDOT GeoPI active lettings</p>
		</div>
	{/if}
</section>

<style>
	.nearby-gdot-panel {
		margin-top: 16px;
	}

	.panel-toggle {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		text-align: left;
		min-height: 48px;
	}

	.panel-toggle h3 {
		margin: 0;
		flex: 1;
	}

	.county-badge {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 3px 10px;
		background: color-mix(in srgb, var(--accent) 15%, var(--surface));
		color: var(--accent);
		border-radius: 999px;
		white-space: nowrap;
	}

	.chevron {
		flex-shrink: 0;
		transition: transform 0.2s;
		color: var(--text-muted);
	}

	.chevron.rotated {
		transform: rotate(180deg);
	}

	.panel-body {
		padding-top: 12px;
		border-top: 1px solid var(--border);
	}

	.project-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.project-card {
		padding: 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.project-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 4px;
		flex-wrap: wrap;
	}

	.project-num {
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--accent);
	}

	.project-route {
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--surface-alt);
		padding: 2px 8px;
		border-radius: 999px;
	}

	.project-desc {
		font-size: 0.85rem;
		color: var(--text);
		margin-bottom: 6px;
		line-height: 1.4;
	}

	.project-meta-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
	}

	.tag {
		font-size: 0.72rem;
		font-weight: 600;
		padding: 2px 8px;
		background: color-mix(in srgb, var(--warning, #f59e0b) 15%, var(--surface));
		color: var(--warning, #f59e0b);
		border-radius: 999px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.meta-item {
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.muted {
		margin: 0 0 12px;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.source-note {
		margin: 12px 0 0;
		font-size: 0.7rem;
		color: var(--text-muted);
		opacity: 0.7;
	}

	.skeleton-row {
		height: 60px;
		border-radius: var(--radius);
		background: linear-gradient(
			90deg,
			var(--surface-alt) 25%,
			var(--surface-hover) 50%,
			var(--surface-alt) 75%
		);
		background-size: 200% 100%;
		animation: skeleton-loading 1.5s ease-in-out infinite;
		margin-bottom: 10px;
	}

	.skeleton-row.short {
		height: 40px;
	}

	@keyframes skeleton-loading {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}
</style>

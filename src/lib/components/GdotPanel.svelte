<script lang="ts">
	let {
		jobSiteId,
		lat,
		lng,
		routeDesignation,
		onRouteSelect
	}: {
		jobSiteId: string;
		lat: number | null;
		lng: number | null;
		routeDesignation: string | null;
		onRouteSelect: (
			routeId: string,
			roadName: string,
			county: string | null,
			district: string | null
		) => void;
	} = $props();

	let expanded = $state(false);
	let searchQuery = $state('');
	let searchResults = $state<
		Array<{
			routeId: string | null;
			roadName: string | null;
			county: string | null;
			district: string | null;
		}>
	>([]);
	let searchTimeout: ReturnType<typeof setTimeout> | null = null;

	let countyData = $state<{ county: string | null; district: string | null } | null>(null);
	let countyLoading = $state(false);

	let projects = $state<
		Array<{
			projectNumber: string | null;
			description: string | null;
			county: string | null;
			letDate: number | null;
			compDate: number | null;
		}>
	>([]);
	let projectsLoading = $state(false);

	function toggleExpanded() {
		expanded = !expanded;
		if (expanded && !countyData && lat !== null && lng !== null) {
			fetchCountyData();
		}
		if (expanded && projects.length === 0 && lat !== null && lng !== null) {
			fetchProjects();
		}
	}

	async function fetchCountyData() {
		if (lat === null || lng === null) return;
		countyLoading = true;
		try {
			const res = await fetch(`/api/gdot/county-lookup?lat=${lat}&lng=${lng}`);
			if (res.ok) {
				countyData = await res.json();
			}
		} catch {
			// Silent fail
		} finally {
			countyLoading = false;
		}
	}

	async function fetchProjects() {
		if (lat === null || lng === null) return;
		projectsLoading = true;
		try {
			const res = await fetch(`/api/gdot/nearby-projects?lat=${lat}&lng=${lng}`);
			if (res.ok) {
				projects = await res.json();
			}
		} catch {
			// Silent fail
		} finally {
			projectsLoading = false;
		}
	}

	function handleSearchInput() {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = setTimeout(async () => {
			if (searchQuery.trim() === '') {
				searchResults = [];
				return;
			}
			try {
				const res = await fetch(`/api/gdot-routes?q=${encodeURIComponent(searchQuery)}`);
				if (res.ok) {
					searchResults = await res.json();
				}
			} catch {
				// Silent fail
			}
		}, 300);
	}

	function selectRoute(result: (typeof searchResults)[0]) {
		if (!result.routeId || !result.roadName) return;
		onRouteSelect(result.routeId, result.roadName, result.county, result.district);
		searchQuery = '';
		searchResults = [];
	}

	$effect(() => {
		const q = searchQuery;
		handleSearchInput();
	});
</script>

<div class="gdot-panel">
	<button class="panel-toggle" onclick={toggleExpanded}>
		<span>GDOT Reference</span>
		<svg
			width="20"
			height="20"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			class:rotated={expanded}
		>
			<polyline points="6 9 12 15 18 9"></polyline>
		</svg>
	</button>

	{#if expanded}
		<div class="panel-content">
			<section class="panel-section">
				<h4>Route Lookup</h4>
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search GDOT routes, e.g. SR-400"
					class="search-input"
				/>
				{#if routeDesignation}
					<div class="current-badge">Current: {routeDesignation}</div>
				{/if}
				{#if searchResults.length > 0}
					<div class="search-results">
						{#each searchResults.slice(0, 5) as result}
							<button class="result-chip" onclick={() => selectRoute(result)}>
								{result.roadName}{result.county ? ` • ${result.county}` : ''}
							</button>
						{/each}
					</div>
				{/if}
			</section>

			{#if lat !== null && lng !== null}
				<section class="panel-section">
					<h4>Location Context</h4>
					{#if countyLoading}
						<div class="loading-skeleton"></div>
					{:else if countyData}
						<div class="info-row">
							<span class="info-label">County:</span>
							<span>{countyData.county || 'Unknown'}</span>
						</div>
						<div class="info-row">
							<span class="info-label">District:</span>
							<span>{countyData.district || 'Unknown'}</span>
						</div>
					{:else}
						<p class="muted">Location data unavailable</p>
					{/if}
				</section>

				<section class="panel-section">
					<h4>Nearby Active Projects</h4>
					{#if projectsLoading}
						<div class="loading-skeleton"></div>
					{:else if projects.length > 0}
						<div class="projects-list">
							{#each projects.slice(0, 5) as project}
								<div class="project-item">
									<div class="project-number">{project.projectNumber || 'N/A'}</div>
									<div class="project-desc">{project.description || 'No description'}</div>
									{#if project.county}
										<div class="project-meta">{project.county}</div>
									{/if}
								</div>
							{/each}
						</div>
					{:else}
						<p class="muted">No active GDOT projects found nearby</p>
					{/if}
				</section>
			{/if}
		</div>
	{/if}
</div>

<style>
	.gdot-panel {
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		margin-top: 16px;
	}

	.panel-toggle {
		width: 100%;
		min-height: 48px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 16px;
		background: none;
		border: none;
		color: var(--text);
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;
		transition: background 0.2s;
	}

	.panel-toggle:hover {
		background: var(--surface-hover);
	}

	.panel-toggle svg {
		transition: transform 0.2s;
	}

	.panel-toggle svg.rotated {
		transform: rotate(180deg);
	}

	.panel-content {
		padding: 16px;
		border-top: 1px solid var(--border);
	}

	.panel-section {
		margin-bottom: 20px;
	}

	.panel-section:last-child {
		margin-bottom: 0;
	}

	.panel-section h4 {
		margin: 0 0 10px;
		font-size: 0.9rem;
		color: var(--text);
		font-weight: 600;
	}

	.search-input {
		width: 100%;
		min-height: 48px;
		padding: 0 14px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 1rem;
	}

	.search-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.current-badge {
		margin-top: 8px;
		display: inline-block;
		padding: 4px 10px;
		background: color-mix(in srgb, var(--accent) 15%, var(--surface));
		color: var(--accent);
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.search-results {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 10px;
	}

	.result-chip {
		min-height: 48px;
		padding: 10px 16px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 999px;
		color: var(--text);
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.result-chip:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 8%, var(--bg));
	}

	.info-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
		font-size: 0.9rem;
	}

	.info-label {
		font-weight: 600;
		color: var(--text-muted);
	}

	.muted {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.loading-skeleton {
		height: 40px;
		background: linear-gradient(
			90deg,
			var(--surface-alt) 25%,
			var(--surface-hover) 50%,
			var(--surface-alt) 75%
		);
		background-size: 200% 100%;
		animation: skeleton-loading 1.5s ease-in-out infinite;
		border-radius: var(--radius);
	}

	@keyframes skeleton-loading {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.projects-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.project-item {
		padding: 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.project-number {
		font-weight: 700;
		font-size: 0.85rem;
		color: var(--accent);
		margin-bottom: 4px;
	}

	.project-desc {
		font-size: 0.85rem;
		color: var(--text);
		margin-bottom: 4px;
	}

	.project-meta {
		font-size: 0.75rem;
		color: var(--text-muted);
	}
</style>

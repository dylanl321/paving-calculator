<script lang="ts">
	import { onMount } from 'svelte';
	import StateSelector from '$lib/components/StateSelector.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { dotStateStore } from '$lib/stores/dotState.svelte';
	import type { DbDotRoadSegment } from '$lib/types/dot';
	import { config } from '$lib/config';

	let segments = $state<DbDotRoadSegment[]>([]);
	let total = $state(0);
	let loading = $state(true);
	let error = $state('');
	let refreshing = $state(false);

	const selectedState = $derived(dotStateStore.selectedDotState);
	const stateLabel = $derived(dotStateStore.dotStateLabel);

	async function fetchSegments() {
		loading = true;
		error = '';

		try {
			const res = await fetch(
				`/api/dot/segments?state=${selectedState}&limit=50&offset=0`,
				{ credentials: 'include' }
			);

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.error || 'Failed to fetch segments');
			}

			const data = await res.json();
			segments = data.segments || [];
			total = data.total || 0;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Network error';
			segments = [];
			total = 0;
		} finally {
			loading = false;
			refreshing = false;
		}
	}

	function handleRefresh() {
		refreshing = true;
		fetchSegments();
	}

	// Fetch when state changes
	$effect(() => {
		selectedState;
		fetchSegments();
	});
</script>

<svelte:head>
	<title>DOT Road Data — {config.app.name}</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h2 class="page-title">DOT Road Data</h2>
			<p class="page-subtitle">View {stateLabel} road segments</p>
		</div>
		<button class="btn-refresh" onclick={handleRefresh} disabled={loading || refreshing}>
			<svg
				width="18"
				height="18"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<polyline points="23 4 23 10 17 10"></polyline>
				<polyline points="1 20 1 14 7 14"></polyline>
				<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
			</svg>
			{refreshing ? 'Refreshing...' : 'Refresh Data'}
		</button>
	</div>

	<div class="selector-section">
		<StateSelector />
	</div>

	{#if error}
		<div class="error-banner">
			<strong>Error:</strong> {error}
		</div>
	{/if}

	{#if loading}
		<div class="loading-state">
			<Skeleton width="100%" height="60px" />
			<Skeleton width="100%" height="60px" />
			<Skeleton width="100%" height="60px" />
			<Skeleton width="100%" height="60px" />
		</div>
	{:else if segments.length === 0}
		<div class="empty-state">
			<div class="empty-icon">
				<svg
					width="64"
					height="64"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
				>
					<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"></path>
					<line x1="8" y1="2" x2="8" y2="18"></line>
					<line x1="16" y1="6" x2="16" y2="22"></line>
				</svg>
			</div>
			<h3>No segments ingested yet</h3>
			<p>
				{stateLabel} road data has not been ingested. Contact your administrator to run the DOT data
				ingestion worker.
			</p>
		</div>
	{:else}
		<div class="results-header">
			<p class="results-count">
				Showing {segments.length.toLocaleString()} of {total.toLocaleString()} segments
			</p>
		</div>

		<div class="segments-table-container">
			<table class="segments-table">
				<thead>
					<tr>
						<th>Road Name</th>
						<th>Route ID</th>
						<th>Surface</th>
						<th>Functional Class</th>
						<th class="num">IRI</th>
						<th class="num">PCI</th>
						<th class="num">AADT</th>
						<th class="num">Length (mi)</th>
					</tr>
				</thead>
				<tbody>
					{#each segments as segment}
						<tr>
							<td class="road-name">{segment.road_name || '—'}</td>
							<td class="route-id">{segment.route_id || '—'}</td>
							<td class="surface-type">{segment.surface_type || '—'}</td>
							<td class="func-class">{segment.functional_class ?? '—'}</td>
							<td class="num">{segment.iri != null ? segment.iri.toFixed(1) : '—'}</td>
							<td class="num">{segment.pci ?? '—'}</td>
							<td class="num">{segment.aadt?.toLocaleString() ?? '—'}</td>
							<td class="num">
								{segment.length_miles != null ? segment.length_miles.toFixed(2) : '—'}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 1400px;
		margin: 0 auto;
		padding: var(--sp-4);
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: var(--sp-4);
		flex-wrap: wrap;
		gap: var(--sp-3);
	}

	.page-title {
		font-size: 1.75rem;
		margin: 0 0 4px;
		color: var(--text);
	}

	.page-subtitle {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
	}

	.btn-refresh {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 48px;
		padding: 0 var(--sp-4);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-refresh:hover:not(:disabled) {
		background: var(--surface-alt);
	}

	.btn-refresh:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.selector-section {
		margin-bottom: var(--sp-4);
	}

	.error-banner {
		padding: var(--sp-3);
		background: color-mix(in srgb, var(--bad) 15%, var(--surface));
		border: 1px solid var(--bad);
		border-radius: var(--radius);
		color: var(--bad);
		margin-bottom: var(--sp-4);
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		gap: var(--sp-3);
	}

	.empty-state {
		text-align: center;
		padding: var(--sp-6) var(--sp-4);
	}

	.empty-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 96px;
		height: 96px;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--border);
		margin-bottom: var(--sp-4);
		color: var(--accent);
	}

	.empty-state h3 {
		margin: 0 0 var(--sp-2);
		font-size: 1.2rem;
		color: var(--text);
	}

	.empty-state p {
		margin: 0;
		font-size: 0.9rem;
		color: var(--text-muted);
		max-width: 500px;
		margin-left: auto;
		margin-right: auto;
		line-height: 1.5;
	}

	.results-header {
		margin-bottom: var(--sp-3);
	}

	.results-count {
		margin: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	.segments-table-container {
		overflow-x: auto;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--surface);
	}

	.segments-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.segments-table thead {
		background: var(--surface-alt);
		border-bottom: 1px solid var(--border);
	}

	.segments-table th {
		padding: 12px;
		text-align: left;
		font-weight: 600;
		color: var(--text);
		font-size: 0.85rem;
		white-space: nowrap;
	}

	.segments-table th.num {
		text-align: right;
	}

	.segments-table td {
		padding: 12px;
		border-bottom: 1px solid var(--border);
		color: var(--text);
	}

	.segments-table td.num {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.segments-table tbody tr:last-child td {
		border-bottom: none;
	}

	.segments-table tbody tr:hover {
		background: var(--surface-alt);
	}

	.road-name {
		font-weight: 500;
	}

	.route-id {
		font-family: monospace;
		font-size: 0.85em;
	}

	@media (max-width: 768px) {
		.page {
			padding: var(--sp-3);
		}

		.segments-table {
			font-size: 0.8rem;
		}

		.segments-table th,
		.segments-table td {
			padding: 8px 6px;
		}
	}
</style>

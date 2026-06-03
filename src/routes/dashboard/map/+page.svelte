<script lang="ts">
	import { config } from '$lib/config';
	import OrgMapView from '$lib/components/OrgMapView.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Map View — {config.app.name}</title>
</svelte:head>

<div class="map-page">
	<div class="page-header">
		<a href="/dashboard" class="back-button">
			<svg
				width="20"
				height="20"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				<line x1="19" y1="12" x2="5" y2="12"></line>
				<polyline points="12 19 5 12 12 5"></polyline>
			</svg>
		</a>
		<h2 class="page-title">Org Map</h2>
	</div>

	<div class="map-wrapper">
		<OrgMapView height="calc(100vh - 120px)" />
	</div>
</div>

<style>
	.map-page {
		width: 100%;
		height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.page-header {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 20px;
		background: var(--background);
		border-bottom: 1px solid var(--border);
	}

	.back-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: var(--text);
		cursor: pointer;
		transition: background 0.2s;
		text-decoration: none;
	}

	.back-button:hover {
		background: var(--surface-hover);
	}

	.page-title {
		margin: 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--text);
	}

	.map-wrapper {
		flex: 1;
		padding: 0 20px 20px;
		overflow: hidden;
	}

	@media (max-width: 640px) {
		.page-header {
			padding: 12px 16px;
		}

		.page-title {
			font-size: 1.25rem;
		}

		.map-wrapper {
			padding: 0 16px 16px;
		}
	}
</style>

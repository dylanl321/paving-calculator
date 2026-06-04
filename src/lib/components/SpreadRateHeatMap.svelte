<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import MapView from '$lib/components/map-v2/MapView.svelte';
	import MapPolyline from '$lib/components/map-v2/MapPolyline.svelte';
	import MapPopup from '$lib/components/map-v2/MapPopup.svelte';
	import { stationToFeet, feetToCoordinate, coordinatesToBounds } from '$lib/services/mapUtils';
	import { formatStation } from '$lib/services/gpsStation';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface SitePin {
		id: string;
		name: string;
		status: 'active' | 'completed' | 'archived';
		latitude: number | null;
		longitude: number | null;
		location_description?: string | null;
	}

	interface HeatEntry {
		station_start: number | null;
		station_end: number | null;
		distance_ft: number | null;
		entry_type: string;
		lane: string | null;
		spread_rate_actual: number | null;
	}

	interface Props {
		site: SitePin;
		waypoints: Waypoint[];
		targetRate?: number | null;
		toleranceLbsSy?: number;
		height?: string;
	}

	let {
		site,
		waypoints,
		targetRate = null,
		toleranceLbsSy = 5,
		height = '360px'
	}: Props = $props();

	let entries = $state<HeatEntry[]>([]);
	let loading = $state(true);
	let fetchError = $state<string | null>(null);

	// Popup state (replaces Leaflet bindPopup)
	let popupOpen = $state(false);
	let popupLat = $state(0);
	let popupLng = $state(0);
	let popupHtml = $state('');

	const hasRoute = $derived(waypoints.length >= 2);
	const hasPinned = $derived(site.latitude != null && site.longitude != null);

	type SegStatus = 'good' | 'warn' | 'bad' | 'nodata';

	function segmentStatus(spreadRate: number | null): SegStatus {
		if (spreadRate == null || targetRate == null) return 'nodata';
		const delta = Math.abs(spreadRate - targetRate);
		if (delta <= toleranceLbsSy) return 'good';
		if (delta <= toleranceLbsSy * 1.5) return 'warn';
		return 'bad';
	}

	const STATUS_COLOR: Record<SegStatus, string> = {
		good: '#22c55e',
		warn: '#f59e0b',
		bad: '#ef4444',
		nodata: '#64748b'
	};

	// Derived counts per status
	const segmentCounts = $derived.by(() => {
		const counts: Record<SegStatus, number> = { good: 0, warn: 0, bad: 0, nodata: 0 };
		for (const e of entries) {
			if (e.station_start != null && e.station_end != null) {
				counts[segmentStatus(e.spread_rate_actual)]++;
			}
		}
		return counts;
	});

	const avgRate = $derived.by(() => {
		const withRate = entries.filter((e) => e.spread_rate_actual != null);
		if (withRate.length === 0) return null;
		const sum = withRate.reduce((acc, e) => acc + (e.spread_rate_actual ?? 0), 0);
		return sum / withRate.length;
	});

	interface Segment {
		id: string;
		coords: [number, number][];
		color: string;
		html: string;
	}

	// Per-segment polylines derived from progress entries projected onto the route.
	const segments = $derived.by<Segment[]>(() => {
		if (waypoints.length < 2) return [];
		const out: Segment[] = [];
		entries.forEach((entry, i) => {
			if (entry.station_start == null || entry.station_end == null) return;
			const startCoord = feetToCoordinate(stationToFeet(entry.station_start), waypoints);
			const endCoord = feetToCoordinate(stationToFeet(entry.station_end), waypoints);
			if (!startCoord || !endCoord) return;
			const status = segmentStatus(entry.spread_rate_actual);
			const rateLabel =
				entry.spread_rate_actual != null
					? `${entry.spread_rate_actual.toFixed(1)} lbs/yd\u00b2`
					: 'No rate recorded';
			const html =
				`<div style="font-size:0.82rem;line-height:1.5">` +
				`<strong>Sta ${formatStation(entry.station_start)} \u2013 ${formatStation(entry.station_end)}</strong><br>` +
				`${rateLabel}` +
				(entry.lane ? `<br>Lane: ${entry.lane}` : '') +
				`</div>`;
			out.push({ id: `seg-${i}`, coords: [startCoord, endCoord], color: STATUS_COLOR[status], html });
		});
		return out;
	});

	const routeCoords = $derived<[number, number][]>(waypoints.map((wp) => [wp.lat, wp.lng]));
	const mapBounds = $derived.by<[[number, number], [number, number]] | null>(() => {
		if (hasRoute) return coordinatesToBounds(routeCoords);
		return null;
	});
	const mapCenter = $derived<[number, number]>(
		hasPinned ? [site.latitude as number, site.longitude as number] : [33.749, -84.388]
	);

	function openSegmentPopup(seg: Segment) {
		popupLat = (seg.coords[0][0] + seg.coords[1][0]) / 2;
		popupLng = (seg.coords[0][1] + seg.coords[1][1]) / 2;
		popupHtml = seg.html;
		popupOpen = true;
	}

	async function loadEntries() {
		loading = true;
		fetchError = null;
		try {
			const res = await fetch(`/api/job-sites/${site.id}/logs/progress`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json() as { progress: HeatEntry[] };
			entries = data.progress ?? [];
		} catch (err) {
			fetchError = err instanceof Error ? err.message : 'Failed to load data';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		void loadEntries();
	});
</script>

<div class="heatmap-panel">
	{#if !hasRoute}
		<div class="empty-state">
			<svg
				width="28"
				height="28"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M3 3l18 18M9 9a3 3 0 0 0 4.24 4.24M3 7v1a2 2 0 0 0 2 2h2" />
				<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
			</svg>
			<p>Draw a route first to see the spread rate heat map.</p>
		</div>
	{:else}
		<!-- Legend bar -->
		<div class="legend-bar">
			<div class="legend-left">
				<span class="legend-title">Spread Rate Heat Map</span>
				{#if avgRate != null}
					<span class="legend-avg">avg {avgRate.toFixed(1)} lbs/yd&sup2;</span>
				{/if}
			</div>
			<div class="legend-swatches">
				<span class="swatch" style="background:#22c55e" aria-label="In-spec"></span>
				<span class="swatch-label">In&#8209;spec ({segmentCounts.good})</span>
				<span class="swatch" style="background:#f59e0b" aria-label="Near limit"></span>
				<span class="swatch-label">Near ({segmentCounts.warn})</span>
				<span class="swatch" style="background:#ef4444" aria-label="Out of spec"></span>
				<span class="swatch-label">Out ({segmentCounts.bad})</span>
				<span class="swatch" style="background:#64748b" aria-label="No data"></span>
				<span class="swatch-label">No data ({segmentCounts.nodata})</span>
			</div>
		</div>

		<div class="map-wrap" style="height:{height}">
			{#if browser}
				<MapView center={mapCenter} bounds={mapBounds} zoom={15} height="100%">
					{#snippet layers()}
						{#if hasRoute}
							<MapPolyline id="srhm-route" coordinates={routeCoords} color="#64748b" width={4} opacity={0.55} />
						{/if}
						{#each segments as seg (seg.id)}
							<MapPolyline
								id={`srhm-${seg.id}`}
								coordinates={seg.coords}
								color={seg.color}
								width={8}
								opacity={0.82}
								onclick={() => openSegmentPopup(seg)}
							/>
						{/each}
						{#if popupOpen}
							<MapPopup
								lat={popupLat}
								lng={popupLng}
								open={popupOpen}
								html={popupHtml}
								onclose={() => (popupOpen = false)}
							/>
						{/if}
					{/snippet}
				</MapView>
			{/if}
			{#if loading}
				<div class="map-overlay-loading" aria-live="polite">Loading&hellip;</div>
			{/if}
			{#if fetchError}
				<div class="map-overlay-error" role="alert">{fetchError}</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.heatmap-panel {
		width: 100%;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 32px 20px;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-state svg {
		opacity: 0.4;
	}

	.empty-state p {
		margin: 0;
		font-size: 0.875rem;
	}

	.legend-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px) var(--radius-md, 12px) 0 0;
		border-bottom: none;
		flex-wrap: wrap;
	}

	.legend-left {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}

	.legend-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
	}

	.legend-avg {
		font-size: 0.8rem;
		color: var(--text-muted);
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		padding: 2px 8px;
		border-radius: 999px;
	}

	.legend-swatches {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.swatch {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.swatch-label {
		font-size: 0.72rem;
		color: var(--text-muted);
		margin-right: 6px;
		white-space: nowrap;
	}

	.map-wrap {
		position: relative;
		width: 100%;
		border-radius: 0 0 var(--radius-md, 12px) var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-overlay-loading {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: rgba(0, 0, 0, 0.35);
		color: var(--text);
		font-size: 0.875rem;
		font-weight: 600;
		z-index: 600;
		pointer-events: none;
	}

	.map-overlay-error {
		position: absolute;
		bottom: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: color-mix(in srgb, var(--bad, #ef4444) 90%, black);
		color: white;
		font-size: 0.8rem;
		padding: 6px 14px;
		border-radius: 8px;
		z-index: 700;
		pointer-events: none;
	}

	@media (max-width: 640px) {
		.legend-bar {
			padding: 8px 12px;
			gap: 8px;
		}

		.legend-title {
			font-size: 0.8rem;
		}

		.swatch-label {
			font-size: 0.68rem;
		}
	}
</style>

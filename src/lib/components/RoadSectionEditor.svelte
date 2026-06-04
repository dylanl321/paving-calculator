<script lang="ts">
	/**
	 * RoadSectionEditor — map-v2 version using MapLibre GL JS.
	 * Replaces old Leaflet-based MapContainer/MapPolyline/MapMarker version.
	 */
	import { browser } from '$app/environment';
	import { MapView, MapPolyline, MapMarker } from '$lib/components/map-v2';
	import {
		coordinateToStation,
		stationToCoordinate,
		sliceRouteByStations,
		lineStringLengthFt
	} from '$lib/services/mapUtils';
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface RoadSection {
		id: string;
		name: string;
		lane: string;
		station_start: number | null;
		station_end: number | null;
		status: 'active' | 'completed' | 'skipped';
		geometry_geojson: string | null;
		notes: string | null;
		sort_order: number;
	}

	interface Props {
		siteId: string;
		waypoints?: Waypoint[];
		numLanes?: number | null;
		totalLengthFt?: number | null;
		height?: string;
	}

	let {
		siteId,
		waypoints = [],
		numLanes = null,
		totalLengthFt = null,
		height = '50vh'
	}: Props = $props();

	let sections = $state<RoadSection[]>([]);
	let mapInstance = $state<MapLibreMap | null>(null);
	let drawMode = $state<'idle' | 'pick-start' | 'pick-end'>('idle');
	/** Station offset of the pending section start, set on the first click. */
	let tempStartStation: number | null = $state(null);
	let flashMessage = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;
	let nextSectionNumber = $state(1);
	let editingSectionId: string | null = $state(null);

	const hasRoute = $derived(waypoints.length >= 2);

	const STATUS_COLORS = {
		active: '#f59e0b',
		completed: '#22c55e',
		skipped: '#6b7280'
	};

	$effect(() => {
		if (browser && siteId) {
			loadSections();
		}
	});

	// Wire up MapLibre click handler whenever map instance changes.
	// Roads-only: every click snaps to the route centerline (a station), so a
	// section can only ever start/end ON the road — no free off-road points.
	$effect(() => {
		if (!mapInstance) return;
		const m = mapInstance;
		function onMapClick(e: { lngLat: { lat: number; lng: number } }) {
			if (drawMode === 'idle') return;
			const station = coordinateToStation(
				{ lat: e.lngLat.lat, lng: e.lngLat.lng },
				waypoints
			);
			if (station === null) {
				flash('Tap closer to the road');
				return;
			}
			if (drawMode === 'pick-start') {
				tempStartStation = station;
				drawMode = 'pick-end';
			} else if (drawMode === 'pick-end' && tempStartStation !== null) {
				createSection(tempStartStation, station);
				tempStartStation = null;
				drawMode = 'idle';
			}
		}
		// @ts-ignore — MapLibre event typing
		m.on('click', onMapClick);
		return () => {
			// @ts-ignore
			m.off('click', onMapClick);
		};
	});

	function flash(msg: string) {
		flashMessage = msg;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			flashMessage = '';
		}, 1400);
	}

	// Update map cursor based on draw mode
	$effect(() => {
		if (!mapInstance) return;
		mapInstance.getCanvas().style.cursor = drawMode !== 'idle' ? 'crosshair' : '';
	});

	async function loadSections() {
		try {
			const res = await fetch(`/api/job-sites/${siteId}/sections`);
			if (res.ok) {
				const data = (await res.json()) as { sections: RoadSection[] };
				sections = data.sections || [];
				nextSectionNumber = sections.length + 1;
			}
		} catch (err) {
			console.error('Failed to load sections:', err);
		}
	}

	function startAddSection() {
		if (!hasRoute) {
			toastStore.error('Define the route alignment first');
			return;
		}
		drawMode = 'pick-start';
		tempStartStation = null;
		editingSectionId = null;
	}

	/**
	 * Create a road section between two stations. The geometry is sliced from the
	 * route centerline so the section line always lies on the road.
	 */
	async function createSection(startStation: number, endStation: number) {
		if (Math.abs(endStation - startStation) < 1e-6) {
			toastStore.error('Section start and end are the same point');
			return;
		}
		const lo = Math.min(startStation, endStation);
		const hi = Math.max(startStation, endStation);
		const geometry = sliceRouteByStations(waypoints, lo, hi);
		if (!geometry) {
			toastStore.error('Could not build section on the road');
			return;
		}

		const newSection = {
			name: `Section ${nextSectionNumber}`,
			lane: '1',
			station_start: lo,
			station_end: hi,
			status: 'active' as const,
			geometry_geojson: JSON.stringify(geometry),
			notes: null,
			sort_order: sections.length
		};

		try {
			const res = await fetch(`/api/job-sites/${siteId}/sections`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(newSection)
			});

			if (res.ok) {
				const created = (await res.json()) as RoadSection;
				sections = [...sections, created];
				nextSectionNumber++;
				toastStore.success('Section created');
			} else {
				toastStore.error('Failed to create section');
			}
		} catch (err) {
			console.error('Failed to create section:', err);
			toastStore.error('Failed to create section');
		}
	}

	function formatStation(station: number | null): string {
		if (station === null) return '\u2014';
		const whole = Math.floor(station);
		const frac = Math.round((station - whole) * 100);
		return `${whole}+${String(frac).padStart(2, '0')}`;
	}

	async function updateSection(id: string, updates: Partial<RoadSection>) {
		try {
			const res = await fetch(`/api/job-sites/${siteId}/sections/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(updates)
			});

			if (res.ok) {
				const updated = (await res.json()) as RoadSection;
				sections = sections.map((s) => (s.id === id ? updated : s));
				toastStore.success('Section updated');
			} else {
				toastStore.error('Failed to update section');
			}
		} catch (err) {
			toastStore.error('Failed to update section');
			console.error('Failed to update section:', err);
		}
	}

	async function deleteSection(id: string) {
		const confirmed = await confirmStore.ask({
			title: 'Delete Section',
			message: 'Delete this road section? This cannot be undone.',
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!confirmed) return;

		try {
			const res = await fetch(`/api/job-sites/${siteId}/sections/${id}`, {
				method: 'DELETE'
			});

			if (res.ok) {
				sections = sections.filter((s) => s.id !== id);
			}
		} catch (err) {
			console.error('Failed to delete section:', err);
		}
	}

	function getSectionGeometry(section: RoadSection): [number, number][] | null {
		if (!section.geometry_geojson) return null;
		try {
			const geom = JSON.parse(section.geometry_geojson);
			if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
				return geom.coordinates.map((c: number[]) => [c[1], c[0]]);
			}
		} catch {
			return null;
		}
		return null;
	}

	/** Length of a section's stored LineString geometry in feet. */
	function sectionLengthFt(section: RoadSection): number {
		if (!section.geometry_geojson) return 0;
		try {
			const geom = JSON.parse(section.geometry_geojson);
			if (geom.type !== 'LineString' || !Array.isArray(geom.coordinates)) return 0;
			return lineStringLengthFt(geom.coordinates as [number, number][]);
		} catch {
			return 0;
		}
	}

	const completedLengthFt = $derived(
		sections.filter((s) => s.status === 'completed').reduce((sum, s) => sum + sectionLengthFt(s), 0)
	);

	const remainingLengthFt = $derived(
		totalLengthFt != null ? Math.max(0, totalLengthFt - completedLengthFt) : null
	);

	function formatFt(ft: number): string {
		return `${Math.round(ft).toLocaleString()} ft`;
	}

	const mapCenter = $derived<[number, number]>(
		waypoints.length > 0 ? [waypoints[0].lat, waypoints[0].lng] : [33.749, -84.388]
	);

	const routePoints = $derived<[number, number][]>(
		waypoints.map((w) => [w.lat, w.lng])
	);

	const tempStartCoord = $derived<[number, number] | null>(
		tempStartStation !== null ? stationToCoordinate(tempStartStation, waypoints) : null
	);

	const instructionText = $derived(
		flashMessage
			? flashMessage
			: drawMode === 'pick-start'
				? 'Tap the road to set section START'
				: drawMode === 'pick-end'
					? 'Tap the road to set section END'
					: ''
	);
</script>

<div class="road-section-editor" style="--editor-height: {height}">
	<div class="map-panel">
		<MapView
			center={mapCenter}
			zoom={15}
			height="100%"
			bind:map={mapInstance}
		>
			{#snippet layers()}
				{#if waypoints.length > 1}
					<MapPolyline
						id="route-waypoints"
						coordinates={routePoints}
						color="#f59e0b"
						width={4}
						opacity={0.85}
					/>
				{/if}

				{#each sections as section, i (section.id)}
					{@const geometry = getSectionGeometry(section)}
					{#if geometry}
						<MapPolyline
							id="section-{section.id}"
							coordinates={geometry}
							color={STATUS_COLORS[section.status]}
							width={5}
							opacity={0.9}
						/>

						<MapMarker
							lat={geometry[0][0]}
							lng={geometry[0][1]}
							color={STATUS_COLORS[section.status]}
						/>

						<MapMarker
							lat={geometry[geometry.length - 1][0]}
							lng={geometry[geometry.length - 1][1]}
							color={STATUS_COLORS[section.status]}
						/>
					{/if}
				{/each}

				{#if tempStartCoord}
					<MapMarker
						lat={tempStartCoord[0]}
						lng={tempStartCoord[1]}
						color="#f59e0b"
						status="active"
					/>
				{/if}
			{/snippet}
		</MapView>

		{#if instructionText}
			<div class="instruction-banner">{instructionText}</div>
		{/if}
	</div>

	<div class="section-panel">
		<div class="panel-header">
			{#if totalLengthFt != null && totalLengthFt > 0}
				<div class="length-summary">
					<div class="length-item">
						<span class="length-label">Total</span>
						<span class="length-value">{formatFt(totalLengthFt)}</span>
					</div>
					<div class="length-item">
						<span class="length-label">Completed</span>
						<span class="length-value done">{formatFt(completedLengthFt)}</span>
					</div>
					<div class="length-item">
						<span class="length-label">Remaining</span>
						<span class="length-value remaining"
							>{remainingLengthFt != null ? formatFt(remainingLengthFt) : '\u2014'}</span
						>
					</div>
				</div>
			{/if}
			<button class="btn-add" onclick={startAddSection} disabled={drawMode !== 'idle' || !hasRoute}>
				<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M10 5v10M5 10h10" />
				</svg>
				Add Section
			</button>
		</div>

		<div class="section-list">
			{#if sections.length === 0}
				<div class="empty-state">
					{#if !hasRoute}
						<p>No route yet</p>
						<p class="hint">Define the road alignment first — sections snap to the road</p>
					{:else}
						<p>No sections yet</p>
						<p class="hint">Tap the road to mark a section start point</p>
					{/if}
				</div>
			{:else}
				{#each sections as section (section.id)}
					<div class="section-card">
						<div class="card-header">
							<div class="status-dot" style="background: {STATUS_COLORS[section.status]}"></div>
							<input
								type="text"
								class="section-name"
								value={section.name}
								onchange={(e) => updateSection(section.id, { name: e.currentTarget.value })}
							/>
							<span class="lane-badge">Lane {section.lane}</span>
						</div>

						<div class="card-body">
							<div class="station-row">
								<span class="label">Start:</span>
								<span class="station">{formatStation(section.station_start)}</span>
								<span class="label">End:</span>
								<span class="station">{formatStation(section.station_end)}</span>
							</div>

							<div class="status-buttons">
								<button
									class="status-btn"
									class:active={section.status === 'active'}
									onclick={() => updateSection(section.id, { status: 'active' })}
								>
									Active
								</button>
								<button
									class="status-btn"
									class:active={section.status === 'completed'}
									onclick={() => updateSection(section.id, { status: 'completed' })}
								>
									Done
								</button>
								<button
									class="status-btn"
									class:active={section.status === 'skipped'}
									onclick={() => updateSection(section.id, { status: 'skipped' })}
								>
									Skip
								</button>
							</div>
						</div>

						<button class="btn-delete" aria-label="Delete section" onclick={() => deleteSection(section.id)}>
							<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M4 6h8M6 6V4h4v2M5 6v8h6V6" />
							</svg>
						</button>
					</div>
				{/each}
			{/if}
		</div>
	</div>
</div>

<style>
	.road-section-editor {
		display: flex;
		flex-direction: column;
		height: var(--editor-height);
		background: var(--surface, #1e1e1e);
		border-radius: 8px;
		overflow: hidden;
	}

	.map-panel {
		flex: 1;
		position: relative;
		min-height: 0;
	}

	.instruction-banner {
		position: absolute;
		top: 12px;
		left: 50%;
		transform: translateX(-50%);
		background: var(--accent, #f59e0b);
		color: var(--bg, #000);
		padding: 12px 24px;
		border-radius: 24px;
		font-weight: 600;
		font-size: 14px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 1000;
		pointer-events: none;
	}

	.section-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--border, #333);
		min-height: 0;
	}

	.panel-header {
		padding: 12px;
		border-bottom: 1px solid var(--border, #333);
	}

	.length-summary {
		display: flex;
		gap: 8px;
		margin-bottom: 12px;
	}

	.length-item {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		background: var(--surface-alt, #2a2a2a);
		border: 1px solid var(--border, #333);
		border-radius: 8px;
	}

	.length-label {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted, #999);
	}

	.length-value {
		font-size: 15px;
		font-weight: 700;
		color: var(--text, #fff);
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	.length-value.done {
		color: #22c55e;
	}

	.length-value.remaining {
		color: var(--accent, #f59e0b);
	}

	.btn-add {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 48px;
		padding: 12px 16px;
		background: var(--accent, #f59e0b);
		color: var(--bg, #000);
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-add:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-add:hover:not(:disabled) {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
	}

	.section-list {
		flex: 1;
		overflow-y: auto;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.empty-state {
		text-align: center;
		padding: 48px 24px;
		color: var(--text-muted, #999);
	}

	.empty-state p {
		margin: 0 0 8px 0;
	}

	.empty-state .hint {
		font-size: 14px;
		opacity: 0.7;
	}

	.section-card {
		position: relative;
		background: var(--surface-alt, #2a2a2a);
		border: 1px solid var(--border, #333);
		border-radius: 8px;
		padding: 12px;
		padding-right: 48px;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 12px;
	}

	.status-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.section-name {
		flex: 1;
		background: transparent;
		border: none;
		color: var(--text, #fff);
		font-size: 16px;
		font-weight: 600;
		padding: 4px 8px;
		border-radius: 4px;
		min-height: 32px;
	}

	.section-name:focus {
		outline: none;
		background: var(--surface, #1e1e1e);
	}

	.lane-badge {
		background: var(--surface, #1e1e1e);
		color: var(--text-muted, #999);
		padding: 4px 12px;
		border-radius: 12px;
		font-size: 13px;
		font-weight: 500;
		white-space: nowrap;
	}

	.card-body {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.station-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
	}

	.station-row .label {
		color: var(--text-muted, #999);
		font-weight: 500;
	}

	.station-row .station {
		color: var(--text, #fff);
		font-weight: 600;
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	.status-buttons {
		display: flex;
		gap: 6px;
	}

	.status-btn {
		flex: 1;
		min-height: 48px;
		padding: 12px;
		background: var(--surface, #1e1e1e);
		color: var(--text-muted, #999);
		border: 1px solid var(--border, #333);
		border-radius: 6px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.status-btn.active {
		background: var(--accent, #f59e0b);
		color: var(--bg, #000);
		border-color: var(--accent, #f59e0b);
	}

	.status-btn:hover:not(.active) {
		background: var(--surface-hover, #333);
	}

	.btn-delete {
		position: absolute;
		top: 12px;
		right: 12px;
		width: 48px;
		height: 48px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		color: var(--bad, #ef4444);
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-delete:hover {
		background: rgba(239, 68, 68, 0.1);
	}

	@media (min-width: 768px) {
		.road-section-editor {
			flex-direction: row;
		}

		.map-panel {
			flex: 2;
		}

		.section-panel {
			flex: 1;
			border-top: none;
			border-left: 1px solid var(--border, #333);
		}
	}
</style>

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
		lineStringLengthFt,
		polylineLengthFt
	} from '$lib/services/mapUtils';
	import { validatePlannedSegment } from '$lib/services/roadSectionPlanning';
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
		production_mix_id?: string | null;
		layer_label?: string | null;
		planned_length_ft?: number | null;
		notes: string | null;
		sort_order: number;
	}

	interface RoadwayLogEvent {
		id: string;
		station: number;
		event_type: string;
		roadway_width_ft: number | null;
		description: string;
	}

	interface Props {
		siteId: string;
		waypoints?: Waypoint[];
		numLanes?: number | null;
		totalLengthFt?: number | null;
		height?: string;
		roadwayLogEvents?: RoadwayLogEvent[];
	}

	let {
		siteId,
		waypoints = [],
		numLanes = null,
		totalLengthFt = null,
		height = '50vh',
		roadwayLogEvents = []
	}: Props = $props();

	let sections = $state<RoadSection[]>([]);
	let mapInstance = $state<MapLibreMap | null>(null);
	let drawMode = $state<'idle' | 'pick-start' | 'pick-end' | 'plan-start'>('idle');
	/** Station offset of the pending section start, set on the first click. */
	let tempStartStation: number | null = $state(null);
	let flashMessage = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;
	let nextSectionNumber = $state(1);
	let editingSectionId: string | null = $state(null);
	let plannedLengthFt = $state<number | null>(null);
	let plannedLayerLabel = $state('');
	let plannedMixId = $state('');
	let cursorStation = $state<number | null>(null);
	let cursorPosition = $state<{ x: number; y: number } | null>(null);
	let showAutoSplitModal = $state(false);
	let autoSplitPreview = $state<Array<{ start: number; end: number; name: string; width: number | null }>>([]);

	const hasRoute = $derived(waypoints.length >= 2);

	const STATUS_COLORS = {
		active: '#f59e0b',
		completed: '#22c55e',
		skipped: '#6b7280'
	};

	// Relevant log events for auto-split (width_change or operation_change)
	const relevantLogEvents = $derived(
		roadwayLogEvents
			.filter((e) => e.event_type === 'width_change' || e.event_type === 'operation_change')
			.sort((a, b) => a.station - b.station)
	);

	const canAutoSplit = $derived(relevantLogEvents.length > 0);

	// Compute overlaps and gaps
	const overlaps = $derived(() => {
		const result: Array<{ a: RoadSection; b: RoadSection; start: number; end: number }> = [];
		for (let i = 0; i < sections.length; i++) {
			for (let j = i + 1; j < sections.length; j++) {
				const a = sections[i];
				const b = sections[j];
				if (
					a.station_start == null ||
					a.station_end == null ||
					b.station_start == null ||
					b.station_end == null
				)
					continue;
				const overlapStart = Math.max(a.station_start, b.station_start);
				const overlapEnd = Math.min(a.station_end, b.station_end);
				if (overlapStart < overlapEnd) {
					result.push({ a, b, start: overlapStart, end: overlapEnd });
				}
			}
		}
		return result;
	});

	const gaps = $derived(() => {
		const routeFt = totalLengthFt ?? polylineLengthFt(waypoints);
		if (routeFt === 0 || sections.length === 0) return [];
		const sorted = sections
			.filter((s) => s.station_start != null && s.station_end != null)
			.slice()
			.sort((a, b) => a.station_start! - b.station_start!);
		const result: Array<{ start: number; end: number }> = [];
		// Gap before first section
		if (sorted[0].station_start! > 0) {
			result.push({ start: 0, end: sorted[0].station_start! });
		}
		// Gaps between sections
		for (let i = 0; i < sorted.length - 1; i++) {
			const gapStart = sorted[i].station_end!;
			const gapEnd = sorted[i + 1].station_start!;
			if (gapStart < gapEnd) {
				result.push({ start: gapStart, end: gapEnd });
			}
		}
		// Gap after last section
		const lastEnd = sorted[sorted.length - 1].station_end!;
		if (lastEnd < routeFt) {
			result.push({ start: lastEnd, end: routeFt });
		}
		return result;
	});

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
			if (drawMode === 'plan-start') {
				createPlannedSection(station);
				tempStartStation = null;
				drawMode = 'idle';
			} else if (drawMode === 'pick-start') {
				tempStartStation = station;
				flash(`Start set at station ${Math.round(station)} ft (${(station / 5280).toFixed(2)} mi)`);
				drawMode = 'pick-end';
			} else if (drawMode === 'pick-end' && tempStartStation !== null) {
				createSection(tempStartStation, station);
				tempStartStation = null;
				drawMode = 'idle';
			}
		}
		function onMouseMove(e: MouseEvent & { lngLat: { lat: number; lng: number } }) {
			if (drawMode !== 'pick-start' && drawMode !== 'pick-end') {
				cursorStation = null;
				cursorPosition = null;
				return;
			}
			const station = coordinateToStation(
				{ lat: e.lngLat.lat, lng: e.lngLat.lng },
				waypoints
			);
			if (station !== null) {
				cursorStation = station;
				cursorPosition = { x: e.clientX, y: e.clientY };
			} else {
				cursorStation = null;
				cursorPosition = null;
			}
		}
		// @ts-ignore — MapLibre event typing
		m.on('click', onMapClick);
		// @ts-ignore
		m.on('mousemove', onMouseMove);
		return () => {
			// @ts-ignore
			m.off('click', onMapClick);
			// @ts-ignore
			m.off('mousemove', onMouseMove);
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

	function startPlannedSegment() {
		if (!hasRoute) {
			toastStore.error('Define the route alignment first');
			return;
		}
		if (!plannedLengthFt || plannedLengthFt <= 0) {
			toastStore.error('Enter a planned length in feet');
			return;
		}
		drawMode = 'plan-start';
		tempStartStation = null;
		editingSectionId = null;
	}

	function openAutoSplitModal() {
		const events = relevantLogEvents;
		if (events.length === 0) {
			toastStore.error('No width_change or operation_change events found');
			return;
		}
		// Build section previews between consecutive event stations
		const preview: Array<{ start: number; end: number; name: string; width: number | null }> = [];
		for (let i = 0; i < events.length - 1; i++) {
			const start = events[i].station;
			const end = events[i + 1].station;
			const name = events[i].description || `Section ${i + 1}`;
			const width = events[i].roadway_width_ft;
			preview.push({ start, end, name, width });
		}
		// Last event to end of route
		const routeFt = totalLengthFt ?? polylineLengthFt(waypoints);
		if (events[events.length - 1].station < routeFt) {
			preview.push({
				start: events[events.length - 1].station,
				end: routeFt,
				name: events[events.length - 1].description || `Section ${events.length}`,
				width: events[events.length - 1].roadway_width_ft
			});
		}
		autoSplitPreview = preview;
		showAutoSplitModal = true;
	}

	async function confirmAutoSplit() {
		showAutoSplitModal = false;
		let created = 0;
		for (const seg of autoSplitPreview) {
			const geometry = sliceRouteByStations(waypoints, seg.start, seg.end);
			if (!geometry) continue;
			const newSection = {
				name: seg.name,
				lane: '1',
				station_start: seg.start,
				station_end: seg.end,
				status: 'active' as const,
				geometry_geojson: JSON.stringify(geometry),
				notes: seg.width ? `Width: ${seg.width} ft` : null,
				sort_order: sections.length + created
			};
			try {
				const res = await fetch(`/api/job-sites/${siteId}/sections`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(newSection)
				});
				if (res.ok) {
					const createdSection = (await res.json()) as RoadSection;
					sections = [...sections, createdSection];
					created++;
				}
			} catch (err) {
				console.error('Failed to create section:', err);
			}
		}
		if (created > 0) {
			nextSectionNumber = sections.length + 1;
			toastStore.success(`Created ${created} section(s) from log events`);
		} else {
			toastStore.error('Failed to create sections');
		}
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

	async function createPlannedSection(startStation: number) {
		const routeFt = totalLengthFt ?? polylineLengthFt(waypoints);
		const planned = validatePlannedSegment(startStation, plannedLengthFt ?? 0, routeFt);
		if (planned.error || planned.stationEnd == null) {
			toastStore.error(planned.error ?? 'Could not create planned segment');
			return;
		}

		const geometry = sliceRouteByStations(waypoints, startStation, planned.stationEnd);
		if (!geometry) {
			toastStore.error('Could not build planned segment on the road');
			return;
		}

		const layer = plannedLayerLabel.trim() || null;
		const newSection = {
			name: `${layer ?? 'Planned'} ${nextSectionNumber}`,
			lane: '1',
			station_start: startStation,
			station_end: planned.stationEnd,
			status: 'active' as const,
			geometry_geojson: JSON.stringify(geometry),
			production_mix_id: plannedMixId.trim() || null,
			layer_label: layer,
			planned_length_ft: plannedLengthFt,
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
				toastStore.success('Planned segment created');
			} else {
				toastStore.error('Failed to create planned segment');
			}
		} catch (err) {
			console.error('Failed to create planned segment:', err);
			toastStore.error('Failed to create planned segment');
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
				? 'Tap on the route to set section start — station will snap to road centerline'
				: drawMode === 'pick-end'
					? 'Tap on the route to set section end'
					: drawMode === 'plan-start'
						? 'Tap the road to set planned segment START'
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

				{#each gaps() as gap (gap.start + '-' + gap.end)}
					{@const gapGeometry = sliceRouteByStations(waypoints, gap.start, gap.end)}
					{#if gapGeometry}
						<MapPolyline
							id="gap-{gap.start}-{gap.end}"
							coordinates={gapGeometry.coordinates.map((c) => [c[1], c[0]])}
							color="#6b7280"
							width={3}
							opacity={0.5}
							dashArray={[4, 4]}
						/>
					{/if}
				{/each}
			{/snippet}
		</MapView>

		{#if instructionText}
			<div class="instruction-banner">{instructionText}</div>
		{/if}

		{#if cursorStation !== null && cursorPosition !== null}
			<div
				class="station-tooltip"
				style="left: {cursorPosition.x + 15}px; top: {cursorPosition.y + 15}px;"
			>
				Station: {Math.round(cursorStation)} ft ({(cursorStation / 5280).toFixed(2)} mi)
			</div>
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
			<div class="planned-form">
				<div class="planned-row">
					<label>
						<span>Length (ft)</span>
						<input type="number" min="1" step="1" bind:value={plannedLengthFt} />
					</label>
					<label>
						<span>Layer</span>
						<input type="text" bind:value={plannedLayerLabel} placeholder="Base" />
					</label>
				</div>
				<label>
					<span>Mix</span>
					<input type="text" bind:value={plannedMixId} placeholder="Mix 1" />
				</label>
				<button type="button" class="btn-add btn-add-secondary" onclick={startPlannedSegment} disabled={drawMode !== 'idle' || !hasRoute}>
					Start + Length
				</button>
			</div>

			{#if canAutoSplit}
				<button type="button" class="btn-add btn-add-auto-split" onclick={openAutoSplitModal} disabled={drawMode !== 'idle' || !hasRoute}>
					<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
						<path d="M3 12h18M3 6h18M3 18h18" />
					</svg>
					Auto-create from log events
				</button>
			{/if}

			<button type="button" class="btn-add" onclick={startAddSection} disabled={drawMode !== 'idle' || !hasRoute}>
				<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M10 5v10M5 10h10" />
				</svg>
				Add Section
			</button>
		</div>

		{#if overlaps().length > 0}
			<div class="overlap-warning">
				<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
					<path d="M10 7v6M10 17h.01" />
					<circle cx="10" cy="10" r="8" />
				</svg>
				<div class="overlap-text">
					{#each overlaps() as overlap}
						<div>
							Sections "{overlap.a.name}" and "{overlap.b.name}" overlap at stations {Math.round(overlap.start)}–{Math.round(overlap.end)} ft
						</div>
					{/each}
				</div>
			</div>
		{/if}

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
									type="button"
									class="status-btn"
									class:active={section.status === 'active'}
									onclick={() => updateSection(section.id, { status: 'active' })}
								>
									Active
								</button>
								<button
									type="button"
									class="status-btn"
									class:active={section.status === 'completed'}
									onclick={() => updateSection(section.id, { status: 'completed' })}
								>
									Done
								</button>
								<button
									type="button"
									class="status-btn"
									class:active={section.status === 'skipped'}
									onclick={() => updateSection(section.id, { status: 'skipped' })}
								>
									Skip
								</button>
							</div>
						</div>

						<button type="button" class="btn-delete" aria-label="Delete section" onclick={() => deleteSection(section.id)}>
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

{#if showAutoSplitModal}
	<div class="modal-backdrop" onclick={() => (showAutoSplitModal = false)}>
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<h3>Auto-create sections from log events</h3>
			<p class="modal-hint">
				This will create {autoSplitPreview.length} section(s) based on width_change and operation_change events:
			</p>
			<div class="auto-split-preview">
				{#each autoSplitPreview as seg, i}
					<div class="preview-row">
						<div class="preview-name">{seg.name}</div>
						<div class="preview-range">
							{Math.round(seg.start)} ft → {Math.round(seg.end)} ft
							{#if seg.width}
								<span class="preview-width">({seg.width} ft wide)</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
			<div class="modal-actions">
				<button type="button" class="btn-modal btn-cancel" onclick={() => (showAutoSplitModal = false)}>
					Cancel
				</button>
				<button type="button" class="btn-modal btn-confirm" onclick={confirmAutoSplit}>
					Create Sections
				</button>
			</div>
		</div>
	</div>
{/if}

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

	.planned-form {
		display: grid;
		gap: 8px;
		margin-bottom: 10px;
	}

	.planned-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}

	.planned-form label {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.planned-form span {
		font-size: 11px;
		text-transform: uppercase;
		color: var(--text-muted, #999);
		font-weight: 700;
	}

	.planned-form input {
		min-height: 40px;
		padding: 8px 10px;
		background: var(--surface, #1e1e1e);
		color: var(--text, #fff);
		border: 1px solid var(--border, #333);
		border-radius: 6px;
	}

	.btn-add-secondary {
		background: var(--surface-alt, #2a2a2a);
		color: var(--text, #fff);
		border: 1px solid var(--border, #333);
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

	.station-tooltip {
		position: fixed;
		background: rgba(0, 0, 0, 0.9);
		color: var(--text, #fff);
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 13px;
		font-weight: 600;
		font-family: 'SF Mono', 'Consolas', monospace;
		pointer-events: none;
		z-index: 2000;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.btn-add-auto-split {
		background: var(--surface-alt, #2a2a2a);
		color: var(--accent, #f59e0b);
		border: 1px solid var(--accent, #f59e0b);
		margin-bottom: 8px;
	}

	.btn-add-auto-split:hover:not(:disabled) {
		background: var(--accent, #f59e0b);
		color: var(--bg, #000);
	}

	.overlap-warning {
		display: flex;
		gap: 12px;
		padding: 12px;
		background: rgba(245, 158, 11, 0.1);
		border: 1px solid rgba(245, 158, 11, 0.3);
		border-radius: 8px;
		color: #fbbf24;
		font-size: 14px;
		margin-bottom: 12px;
	}

	.overlap-warning svg {
		flex-shrink: 0;
		margin-top: 2px;
	}

	.overlap-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 3000;
		padding: 24px;
	}

	.modal-content {
		background: var(--surface, #1e1e1e);
		border: 1px solid var(--border, #333);
		border-radius: 12px;
		padding: 24px;
		max-width: 600px;
		width: 100%;
		max-height: 80vh;
		overflow-y: auto;
	}

	.modal-content h3 {
		margin: 0 0 8px 0;
		font-size: 20px;
		font-weight: 700;
		color: var(--text, #fff);
	}

	.modal-hint {
		margin: 0 0 16px 0;
		font-size: 14px;
		color: var(--text-muted, #999);
	}

	.auto-split-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 24px;
		max-height: 400px;
		overflow-y: auto;
	}

	.preview-row {
		padding: 12px;
		background: var(--surface-alt, #2a2a2a);
		border: 1px solid var(--border, #333);
		border-radius: 8px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preview-name {
		font-weight: 600;
		color: var(--text, #fff);
	}

	.preview-range {
		font-size: 13px;
		color: var(--text-muted, #999);
		font-family: 'SF Mono', 'Consolas', monospace;
	}

	.preview-width {
		color: var(--accent, #f59e0b);
		margin-left: 8px;
	}

	.modal-actions {
		display: flex;
		gap: 12px;
	}

	.btn-modal {
		flex: 1;
		min-height: 48px;
		padding: 12px 16px;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 16px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-cancel {
		background: var(--surface-alt, #2a2a2a);
		color: var(--text, #fff);
		border: 1px solid var(--border, #333);
	}

	.btn-cancel:hover {
		background: var(--surface-hover, #333);
	}

	.btn-confirm {
		background: var(--accent, #f59e0b);
		color: var(--bg, #000);
	}

	.btn-confirm:hover {
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
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

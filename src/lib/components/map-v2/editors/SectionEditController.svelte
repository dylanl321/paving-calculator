<script lang="ts" module>
	export interface SectionEditWaypoint {
		lat: number;
		lng: number;
	}

	export interface RoadSection {
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

	export interface SectionRoadwayLogEvent {
		id: string;
		station: number;
		event_type: string;
		roadway_width_ft: number | null;
		description: string;
	}

	export interface AutoSplitSegment {
		start: number;
		end: number;
		name: string;
		width: number | null;
	}

	/**
	 * Imperative + reactive surface a parent uses to drive the section editor and
	 * render its side-panel chrome (section list, planned-segment form, auto-split
	 * modal, length summary). The controller stays the single owner of the map
	 * click → station projection → slice-on-road logic and the section CRUD.
	 */
	export interface SectionEditApi {
		readonly sections: RoadSection[];
		readonly drawMode: 'idle' | 'pick-start' | 'pick-end' | 'plan-start';
		readonly tempStartStation: number | null;
		readonly flashMessage: string;
		readonly cursorStation: number | null;
		readonly cursorPosition: { x: number; y: number } | null;
		readonly nextSectionNumber: number;
		startAddSection(): void;
		startPlannedSegment(opts: { lengthFt: number | null; layerLabel: string; mixId: string }): void;
		buildAutoSplitPreview(): AutoSplitSegment[];
		confirmAutoSplit(preview: AutoSplitSegment[]): Promise<void>;
		updateSection(id: string, updates: Partial<RoadSection>): Promise<void>;
		deleteSection(id: string): Promise<void>;
	}
</script>

<script lang="ts">
	/**
	 * SectionEditController — road-section building logic + layers that ATTACH to
	 * an existing <MapView> via getMapContext(). It does NOT render its own map;
	 * mount it inside a <MapView>'s {#snippet layers()} so a parent can host one
	 * shared map and toggle this controller via the `active` prop.
	 *
	 * Roads-only by design: every map click is projected onto the route
	 * centerline (coordinateToStation), so a section can only ever start/end ON
	 * the road. Section geometry is sliced from the route centerline
	 * (sliceRouteByStations) — never free-drawn. A click off the road is rejected.
	 */
	import { browser } from '$app/environment';
	import { getMapContext } from '../mapContext.js';
	import MapPolyline from '../MapPolyline.svelte';
	import MapMarker from '../MapMarker.svelte';
	import {
		coordinateToStation,
		stationToCoordinate,
		sliceRouteByStations,
		polylineLengthFt
	} from '$lib/services/mapUtils';
	import { validatePlannedSegment } from '$lib/services/roadSectionPlanning';
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';

	interface Props {
		siteId: string;
		waypoints?: SectionEditWaypoint[];
		totalLengthFt?: number | null;
		roadwayLogEvents?: SectionRoadwayLogEvent[];
		/** Whether map interactions are enabled. A parent enables exactly one editor. */
		active?: boolean;
		/** Fired whenever the loaded section list changes. */
		onSectionsChange?: (sections: RoadSection[]) => void;
		/** Two-way handle exposing reactive state + actions to the parent chrome. */
		api?: SectionEditApi | null;
	}

	let {
		siteId,
		waypoints = [],
		totalLengthFt = null,
		roadwayLogEvents = [],
		active = true,
		onSectionsChange,
		api = $bindable(null)
	}: Props = $props();

	const { getMap } = getMapContext();

	let sections = $state<RoadSection[]>([]);
	let drawMode = $state<'idle' | 'pick-start' | 'pick-end' | 'plan-start'>('idle');
	/** Station offset of the pending section start, set on the first click. */
	let tempStartStation: number | null = $state(null);
	let flashMessage = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;
	let nextSectionNumber = $state(1);
	let cursorStation = $state<number | null>(null);
	let cursorPosition = $state<{ x: number; y: number } | null>(null);

	// Pending planned-segment params handed in by the parent form.
	let plannedLengthFt: number | null = null;
	let plannedLayerLabel = '';
	let plannedMixId = '';

	const hasRoute = $derived(waypoints.length >= 2);

	const STATUS_COLORS = {
		active: '#f59e0b',
		completed: '#22c55e',
		skipped: '#6b7280'
	};

	const relevantLogEvents = $derived(
		roadwayLogEvents
			.filter((e) => e.event_type === 'width_change' || e.event_type === 'operation_change')
			.sort((a, b) => a.station - b.station)
	);

	const routePoints = $derived<[number, number][]>(waypoints.map((w) => [w.lat, w.lng]));

	const tempStartCoord = $derived<[number, number] | null>(
		tempStartStation !== null ? stationToCoordinate(tempStartStation, waypoints) : null
	);

	const gaps = $derived(() => {
		const routeFt = totalLengthFt ?? polylineLengthFt(waypoints);
		if (routeFt === 0 || sections.length === 0) return [];
		const sorted = sections
			.filter((s) => s.station_start != null && s.station_end != null)
			.slice()
			.sort((a, b) => a.station_start! - b.station_start!);
		const result: Array<{ start: number; end: number }> = [];
		if (sorted[0].station_start! > 0) {
			result.push({ start: 0, end: sorted[0].station_start! });
		}
		for (let i = 0; i < sorted.length - 1; i++) {
			const gapStart = sorted[i].station_end!;
			const gapEnd = sorted[i + 1].station_start!;
			if (gapStart < gapEnd) {
				result.push({ start: gapStart, end: gapEnd });
			}
		}
		const lastEnd = sorted[sorted.length - 1].station_end!;
		if (lastEnd < routeFt) {
			result.push({ start: lastEnd, end: routeFt });
		}
		return result;
	});

	$effect(() => {
		if (browser && siteId) {
			void loadSections();
		}
	});

	// Wire up MapLibre click + mousemove handlers. Roads-only: every click snaps
	// to the route centerline (a station), so a section can only ever start/end
	// ON the road — no free off-road points.
	$effect(() => {
		if (!active) return;
		const m = getMap();
		if (!m) return;
		function onMapClick(e: { lngLat: { lat: number; lng: number } }) {
			if (drawMode === 'idle') return;
			const station = coordinateToStation({ lat: e.lngLat.lat, lng: e.lngLat.lng }, waypoints);
			if (station === null) {
				flash('Tap closer to the road');
				return;
			}
			if (drawMode === 'plan-start') {
				void createPlannedSection(station);
				tempStartStation = null;
				drawMode = 'idle';
			} else if (drawMode === 'pick-start') {
				tempStartStation = station;
				flash(`Start set at station ${Math.round(station)} ft (${(station / 5280).toFixed(2)} mi)`);
				drawMode = 'pick-end';
			} else if (drawMode === 'pick-end' && tempStartStation !== null) {
				void createSection(tempStartStation, station);
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
			const station = coordinateToStation({ lat: e.lngLat.lat, lng: e.lngLat.lng }, waypoints);
			if (station !== null) {
				cursorStation = station;
				cursorPosition = { x: e.clientX, y: e.clientY };
			} else {
				cursorStation = null;
				cursorPosition = null;
			}
		}
		m.on('click', onMapClick);
		m.on('mousemove', onMouseMove);
		return () => {
			m.off('click', onMapClick);
			m.off('mousemove', onMouseMove);
		};
	});

	// Update map cursor based on draw mode.
	$effect(() => {
		const m = getMap();
		if (!m) return;
		m.getCanvas().style.cursor = drawMode !== 'idle' ? 'crosshair' : '';
	});

	// Leave draw mode when deactivated.
	$effect(() => {
		if (!active && drawMode !== 'idle') {
			drawMode = 'idle';
			tempStartStation = null;
		}
	});

	function flash(msg: string) {
		flashMessage = msg;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => {
			flashMessage = '';
		}, 1400);
	}

	async function loadSections() {
		try {
			const res = await fetch(`/api/job-sites/${siteId}/sections`);
			if (res.ok) {
				const data = (await res.json()) as { sections: RoadSection[] };
				sections = data.sections || [];
				nextSectionNumber = sections.length + 1;
				onSectionsChange?.(sections);
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
	}

	function startPlannedSegment(opts: { lengthFt: number | null; layerLabel: string; mixId: string }) {
		if (!hasRoute) {
			toastStore.error('Define the route alignment first');
			return;
		}
		if (!opts.lengthFt || opts.lengthFt <= 0) {
			toastStore.error('Enter a planned length in feet');
			return;
		}
		plannedLengthFt = opts.lengthFt;
		plannedLayerLabel = opts.layerLabel;
		plannedMixId = opts.mixId;
		drawMode = 'plan-start';
		tempStartStation = null;
	}

	function buildAutoSplitPreview(): AutoSplitSegment[] {
		const events = relevantLogEvents;
		if (events.length === 0) {
			toastStore.error('No width_change or operation_change events found');
			return [];
		}
		const preview: AutoSplitSegment[] = [];
		for (let i = 0; i < events.length - 1; i++) {
			preview.push({
				start: events[i].station,
				end: events[i + 1].station,
				name: events[i].description || `Section ${i + 1}`,
				width: events[i].roadway_width_ft
			});
		}
		const routeFt = totalLengthFt ?? polylineLengthFt(waypoints);
		if (events[events.length - 1].station < routeFt) {
			preview.push({
				start: events[events.length - 1].station,
				end: routeFt,
				name: events[events.length - 1].description || `Section ${events.length}`,
				width: events[events.length - 1].roadway_width_ft
			});
		}
		return preview;
	}

	async function confirmAutoSplit(preview: AutoSplitSegment[]) {
		let created = 0;
		for (const seg of preview) {
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
			onSectionsChange?.(sections);
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
				onSectionsChange?.(sections);
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
				onSectionsChange?.(sections);
				toastStore.success('Planned segment created');
			} else {
				toastStore.error('Failed to create planned segment');
			}
		} catch (err) {
			console.error('Failed to create planned segment:', err);
			toastStore.error('Failed to create planned segment');
		}
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
				onSectionsChange?.(sections);
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
				onSectionsChange?.(sections);
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

	// Expose reactive state + actions to the parent chrome.
	$effect(() => {
		api = {
			get sections() {
				return sections;
			},
			get drawMode() {
				return drawMode;
			},
			get tempStartStation() {
				return tempStartStation;
			},
			get flashMessage() {
				return flashMessage;
			},
			get cursorStation() {
				return cursorStation;
			},
			get cursorPosition() {
				return cursorPosition;
			},
			get nextSectionNumber() {
				return nextSectionNumber;
			},
			startAddSection,
			startPlannedSegment,
			buildAutoSplitPreview,
			confirmAutoSplit,
			updateSection,
			deleteSection
		};
	});
</script>

{#if waypoints.length > 1}
	<MapPolyline id="route-waypoints" coordinates={routePoints} color="#f59e0b" width={4} opacity={0.85} />
{/if}

{#each sections as section (section.id)}
	{@const geometry = getSectionGeometry(section)}
	{#if geometry}
		<MapPolyline
			id="section-{section.id}"
			coordinates={geometry}
			color={STATUS_COLORS[section.status]}
			width={5}
			opacity={0.9}
		/>

		<MapMarker lat={geometry[0][0]} lng={geometry[0][1]} color={STATUS_COLORS[section.status]} />

		<MapMarker
			lat={geometry[geometry.length - 1][0]}
			lng={geometry[geometry.length - 1][1]}
			color={STATUS_COLORS[section.status]}
		/>
	{/if}
{/each}

{#if tempStartCoord}
	<MapMarker lat={tempStartCoord[0]} lng={tempStartCoord[1]} color="#f59e0b" status="active" />
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

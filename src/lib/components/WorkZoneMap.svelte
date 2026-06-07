<script lang="ts">
	/**
	 * WorkZoneMap — work zones as a route STATION-RANGE corridor, NOT free
	 * per-vertex polygons. A zone is defined by a begin/end station picked on the
	 * road (snapped via coordinateToStation); the displayed/stored polygon is a
	 * road-corridor buffered from the route slice between the two stations
	 * (routeCorridorPolygon). Roads-only by design — there is no off-road drawing.
	 *
	 * The corridor is generated INTO the existing `geometry_geojson` field and the
	 * POST .../work-zones payload is unchanged (no API/schema change).
	 */
	import { onMount } from 'svelte';
	import { MapView, MapPolygon, MapPolyline, MapMarker, MapStatus } from '$lib/components/map-v2';
	import Button from '$lib/components/ui/Button.svelte';
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import {
		coordinateToStation,
		stationToCoordinate,
		sliceRouteByStations,
		routeCorridorPolygon
	} from '$lib/services/mapUtils';
	import { formatStation } from '$lib/services/gpsStation';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	interface Waypoint {
		lat: number;
		lng: number;
	}

	interface Props {
		orgId: string;
		siteId: string;
		lat: number;
		lng: number;
		/** Saved route centerline ([lat,lng]); zones are station ranges along it. */
		waypoints?: Waypoint[];
		/** Lane count + width set the default corridor band width. */
		numLanes?: number | null;
		laneWidthFt?: number | null;
		readonly?: boolean;
	}

	let {
		orgId,
		siteId,
		lat,
		lng,
		waypoints = [],
		numLanes = null,
		laneWidthFt = null,
		readonly = false
	}: Props = $props();

	interface WorkZone {
		id: number;
		name: string;
		zone_type: 'paving' | 'milling' | 'tack' | 'base' | 'other';
		status: 'pending' | 'active' | 'complete' | 'hold';
		geometry_geojson: string | null;
		color: string | null;
		notes: string | null;
	}

	const ZONE_TYPE_COLORS: Record<string, string> = {
		paving: '#f2c037',
		milling: '#f97316',
		tack: '#3b82f6',
		base: '#22c55e',
		other: '#94a3b8'
	};

	const ZONE_TYPE_LABELS: Record<string, string> = {
		paving: 'Paving',
		milling: 'Milling',
		tack: 'Tack Coat',
		base: 'Base',
		other: 'Other'
	};

	let zones = $state<WorkZone[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let mapInstance = $state<MapLibreMap | null>(null);

	const hasRoute = $derived(waypoints.length >= 2);

	// Default corridor band width (ft): lane count × lane width, fallback 24 ft.
	const defaultBandWidthFt = $derived(
		numLanes && laneWidthFt && numLanes > 0 && laneWidthFt > 0 ? numLanes * laneWidthFt : 24
	);

	// Station-range picking state.
	let pickMode = $state<'idle' | 'pick-start' | 'pick-end'>('idle');
	let beginStation = $state<number | null>(null);
	let endStation = $state<number | null>(null);
	// Seed the band width from lane geometry; reset live in startZone().
	// svelte-ignore state_referenced_locally
	let bandWidthFt = $state<number>(defaultBandWidthFt);
	let selectedType = $state<'paving' | 'milling' | 'tack' | 'base' | 'other'>('paving');
	let showZoneForm = $state(false);
	let selectedZone = $state<WorkZone | null>(null);
	let saving = $state(false);
	let flashMessage = $state('');
	let flashTimer: ReturnType<typeof setTimeout> | null = null;

	let zoneForm = $state({
		name: '',
		zone_type: 'paving' as 'paving' | 'milling' | 'tack' | 'base' | 'other',
		notes: ''
	});

	const routePoints = $derived<[number, number][]>(waypoints.map((w) => [w.lat, w.lng]));

	const beginCoord = $derived<[number, number] | null>(
		beginStation != null && hasRoute ? stationToCoordinate(beginStation, waypoints) : null
	);
	const endCoord = $derived<[number, number] | null>(
		endStation != null && hasRoute ? stationToCoordinate(endStation, waypoints) : null
	);

	// Live corridor preview between the two picked stations.
	const previewPolygon = $derived.by<[number, number][] | null>(() => {
		if (beginStation == null || endStation == null) return null;
		const poly = routeCorridorPolygon(waypoints, beginStation, endStation, bandWidthFt);
		if (!poly) return null;
		return poly.coordinates[0].map((c) => [c[1], c[0]] as [number, number]);
	});

	// The slice line (centerline of the pending zone) for clarity while picking.
	const previewLine = $derived.by<[number, number][] | null>(() => {
		if (beginStation == null || endStation == null) return null;
		const slice = sliceRouteByStations(waypoints, beginStation, endStation);
		if (!slice) return null;
		return slice.coordinates.map((c) => [c[1], c[0]] as [number, number]);
	});

	const rangeSummary = $derived.by(() => {
		if (beginStation == null || endStation == null) return '';
		const distFt = Math.abs(endStation - beginStation) * 100;
		return `${formatStation(beginStation)} → ${formatStation(endStation)} · ${distFt.toFixed(0)} ft · ${Math.round(bandWidthFt)} ft wide`;
	});

	function flash(msg: string) {
		flashMessage = msg;
		if (flashTimer) clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flashMessage = ''), 1600);
	}

	function parseZoneCoords(geoJsonStr: string | null): [number, number][] {
		if (!geoJsonStr) return [];
		try {
			const parsed = JSON.parse(geoJsonStr);
			if (parsed.type === 'Polygon' && Array.isArray(parsed.coordinates)) {
				return parsed.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
			}
			let feature = null;
			if (parsed.type === 'FeatureCollection' && parsed.features?.length > 0) feature = parsed.features[0];
			else if (parsed.type === 'Feature') feature = parsed;
			if (feature?.geometry?.type === 'Polygon') {
				return feature.geometry.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
			}
		} catch (err) {
			console.error('Failed to parse work-zone GeoJSON:', err);
		}
		return [];
	}

	async function loadZones() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/org/${orgId}/job-sites/${siteId}/work-zones`, {
				credentials: 'include'
			});
			if (!res.ok) throw new Error('Failed to load work zones');
			const data: { work_zones: WorkZone[] } = await res.json();
			zones = data.work_zones || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load zones';
		} finally {
			loading = false;
		}
	}

	function startZone(type: 'paving' | 'milling' | 'tack' | 'base' | 'other') {
		if (readonly || !hasRoute) return;
		selectedType = type;
		beginStation = null;
		endStation = null;
		bandWidthFt = defaultBandWidthFt;
		showZoneForm = false;
		pickMode = 'pick-start';
		if (mapInstance) mapInstance.getCanvas().style.cursor = 'crosshair';
		flash('Tap the road to set the zone START');
	}

	function cancelZone() {
		pickMode = 'idle';
		beginStation = null;
		endStation = null;
		showZoneForm = false;
		if (mapInstance) mapInstance.getCanvas().style.cursor = '';
	}

	function handleMapReady(map: MapLibreMap) {
		mapInstance = map;
		map.on('click', (e) => {
			if (pickMode === 'idle') return;
			const station = coordinateToStation({ lat: e.lngLat.lat, lng: e.lngLat.lng }, waypoints);
			if (station === null) {
				flash('Tap closer to the road');
				return;
			}
			if (pickMode === 'pick-start') {
				beginStation = station;
				pickMode = 'pick-end';
				flash(`Start at ${formatStation(station)} — tap the zone END`);
			} else if (pickMode === 'pick-end') {
				endStation = station;
				pickMode = 'idle';
				if (mapInstance) mapInstance.getCanvas().style.cursor = '';
				openZoneForm();
			}
		});
	}

	function openZoneForm() {
		if (beginStation == null || endStation == null) return;
		if (Math.abs(endStation - beginStation) < 1e-6) {
			flash('Start and end are the same point');
			beginStation = null;
			endStation = null;
			pickMode = 'pick-start';
			return;
		}
		zoneForm.zone_type = selectedType;
		zoneForm.name = '';
		zoneForm.notes = '';
		showZoneForm = true;
	}

	async function saveZone() {
		if (beginStation == null || endStation == null || !zoneForm.name) return;
		const corridor = routeCorridorPolygon(waypoints, beginStation, endStation, bandWidthFt);
		if (!corridor) {
			toastStore.error('Could not build the corridor on the road');
			return;
		}
		saving = true;
		try {
			const res = await fetch(`/api/org/${orgId}/job-sites/${siteId}/work-zones`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					name: zoneForm.name,
					zone_type: zoneForm.zone_type,
					geometry_geojson: JSON.stringify(corridor),
					color: ZONE_TYPE_COLORS[zoneForm.zone_type],
					notes: zoneForm.notes || null
				})
			});
			if (!res.ok) throw new Error('Failed to create work zone');
			await loadZones();
			cancelZone();
			toastStore.success('Work zone created');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save zone';
			toastStore.error('Failed to create work zone');
		} finally {
			saving = false;
		}
	}

	async function updateZoneStatus(zoneId: number, status: 'pending' | 'active' | 'complete' | 'hold') {
		saving = true;
		try {
			const res = await fetch(`/api/org/${orgId}/job-sites/${siteId}/work-zones/${zoneId}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ status })
			});
			if (!res.ok) throw new Error('Failed to update zone status');
			await loadZones();
			toastStore.success('Zone status updated');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update zone';
			toastStore.error('Failed to update zone');
		} finally {
			saving = false;
		}
	}

	async function deleteZone(zoneId: number) {
		const confirmed = await confirmStore.ask({
			title: 'Delete Work Zone',
			message: 'Delete this work zone? This cannot be undone.',
			confirmLabel: 'Delete',
			destructive: true
		});
		if (!confirmed) return;
		saving = true;
		try {
			const res = await fetch(`/api/org/${orgId}/job-sites/${siteId}/work-zones/${zoneId}`, {
				method: 'DELETE',
				credentials: 'include'
			});
			if (!res.ok) throw new Error('Failed to delete zone');
			await loadZones();
			selectedZone = null;
			toastStore.success('Zone deleted');
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete zone';
			toastStore.error('Failed to delete zone');
		} finally {
			saving = false;
		}
	}

	const STATUS_COLOR: Record<string, string> = {
		complete: '#22c55e',
		active: '#f2c037',
		hold: '#ef4444',
		pending: '#94a3b8'
	};

	onMount(() => {
		loadZones();
	});
</script>

<div class="work-zone-map">
	{#if !hasRoute}
		<MapStatus
			kind="empty"
			title="No route yet"
			message="Draw or import the road alignment first — work zones are station ranges along the route."
			height="320px"
		/>
	{:else}
		{#if error}
			<MapStatus kind="error" message={error} height="auto" />
		{/if}

		<div class="map-container">
			<MapView center={[lat, lng]} zoom={15} height="500px" onready={handleMapReady}>
				{#snippet layers()}
					<MapPolyline id="wz-route" coordinates={routePoints} color="#f59e0b" width={3} opacity={0.7} />

					{#each zones as zone (zone.id)}
						{@const coords = parseZoneCoords(zone.geometry_geojson)}
						{#if coords.length > 0}
							<MapPolygon
								id="zone-{zone.id}"
								coordinates={coords}
								color={zone.color || ZONE_TYPE_COLORS[zone.zone_type]}
								opacity={0.7}
								fillOpacity={0.25}
							/>
						{/if}
					{/each}

					{#if previewPolygon}
						<MapPolygon
							id="wz-preview"
							coordinates={previewPolygon}
							color={ZONE_TYPE_COLORS[selectedType]}
							opacity={0.9}
							fillOpacity={0.2}
						/>
					{/if}
					{#if previewLine}
						<MapPolyline id="wz-preview-line" coordinates={previewLine} color={ZONE_TYPE_COLORS[selectedType]} width={4} opacity={0.95} />
					{/if}
					{#if beginCoord}
						<MapMarker lat={beginCoord[0]} lng={beginCoord[1]} color={ZONE_TYPE_COLORS[selectedType]} label="S" />
					{/if}
					{#if endCoord}
						<MapMarker lat={endCoord[0]} lng={endCoord[1]} color={ZONE_TYPE_COLORS[selectedType]} label="E" />
					{/if}
				{/snippet}
			</MapView>

			{#if pickMode !== 'idle' || flashMessage}
				<div class="pick-pill" class:pick-pill--flash={!!flashMessage}>
					{#if flashMessage}
						{flashMessage}
					{:else if pickMode === 'pick-start'}
						Tap the road to set the zone START
					{:else}
						Tap the road to set the zone END
					{/if}
				</div>
			{/if}

			{#if pickMode !== 'idle'}
				<div class="pick-cancel">
					<Button variant="ghost" size="sm" onclick={cancelZone}>Cancel</Button>
				</div>
			{/if}
		</div>

		{#if !readonly}
			<div class="toolbar">
				{#each Object.entries(ZONE_TYPE_LABELS) as [type, label] (type)}
					<Button
						variant={selectedType === type && pickMode !== 'idle' ? 'primary' : 'secondary'}
						size="sm"
						disabled={pickMode !== 'idle'}
						onclick={() => startZone(type as 'paving' | 'milling' | 'tack' | 'base' | 'other')}
					>
						<span class="zone-dot" style="background:{ZONE_TYPE_COLORS[type]}"></span>
						{label}
					</Button>
				{/each}
			</div>
		{/if}

		{#if showZoneForm}
			<div class="zone-form-panel">
				<h4>New Work Zone</h4>
				{#if rangeSummary}<p class="range-summary">{rangeSummary}</p>{/if}
				<div class="form-row">
					<label class="form-label" for="zone-name">Zone Name</label>
					<input id="zone-name" class="form-input" type="text" placeholder="e.g. North Approach" bind:value={zoneForm.name} />
				</div>
				<div class="form-row">
					<label class="form-label" for="zone-width">Corridor width (ft)</label>
					<input id="zone-width" class="form-input" type="number" min="1" step="1" bind:value={bandWidthFt} />
				</div>
				<div class="form-row">
					<label class="form-label" for="zone-notes">Notes (optional)</label>
					<textarea id="zone-notes" class="form-input form-textarea" placeholder="Any notes about this zone…" bind:value={zoneForm.notes}></textarea>
				</div>
				<div class="form-actions">
					<Button variant="primary" onclick={saveZone} disabled={saving || !zoneForm.name}>
						{saving ? 'Saving…' : 'Save Zone'}
					</Button>
					<Button variant="ghost" onclick={cancelZone}>Cancel</Button>
				</div>
			</div>
		{/if}

		{#if zones.length > 0}
			<div class="zone-list">
				{#each zones as zone (zone.id)}
					<div class="zone-item" class:selected={selectedZone?.id === zone.id}>
						<div
							class="zone-item-header"
							role="button"
							tabindex="0"
							onclick={() => (selectedZone = selectedZone?.id === zone.id ? null : zone)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									selectedZone = selectedZone?.id === zone.id ? null : zone;
								}
							}}
						>
							<span class="zone-dot-sm" style="background:{zone.color || ZONE_TYPE_COLORS[zone.zone_type]}"></span>
							<span class="zone-item-name">{zone.name}</span>
							<span class="zone-type-badge">{ZONE_TYPE_LABELS[zone.zone_type]}</span>
							<span class="zone-status-badge" style="--s-color:{STATUS_COLOR[zone.status]}">{zone.status}</span>
						</div>
						{#if selectedZone?.id === zone.id && !readonly}
							<div class="zone-item-actions">
								<Button variant="secondary" size="sm" onclick={() => updateZoneStatus(zone.id, 'active')} disabled={zone.status === 'active' || saving}>Active</Button>
								<Button variant="secondary" size="sm" onclick={() => updateZoneStatus(zone.id, 'complete')} disabled={zone.status === 'complete' || saving}>Complete</Button>
								<Button variant="secondary" size="sm" onclick={() => updateZoneStatus(zone.id, 'hold')} disabled={zone.status === 'hold' || saving}>Hold</Button>
								<Button variant="danger" size="sm" onclick={() => deleteZone(zone.id)} disabled={saving}>Delete</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.work-zone-map {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.map-container {
		position: relative;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
	}

	.pick-pill {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		z-index: 400;
		padding: 6px 14px;
		border-radius: 20px;
		background: color-mix(in srgb, var(--text) 80%, transparent);
		color: var(--surface);
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		pointer-events: none;
	}

	.pick-pill--flash {
		background: var(--bad);
		color: var(--accent-text);
	}

	.pick-cancel {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 400;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.zone-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.zone-form-panel {
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
	}

	.zone-form-panel h4 {
		margin: 0 0 8px;
		font-size: 0.95rem;
		color: var(--text);
	}

	.range-summary {
		margin: 0 0 12px;
		font-size: 0.82rem;
		font-weight: 600;
		color: var(--accent);
	}

	.form-row {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}

	.form-label {
		font-size: 0.8rem;
		color: var(--text-muted);
		font-weight: 600;
	}

	.form-input {
		padding: 10px 12px;
		background: var(--surface-alt, var(--surface));
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.9rem;
		min-height: 44px;
	}

	.form-textarea {
		min-height: 72px;
		resize: vertical;
	}

	.form-actions {
		display: flex;
		gap: 8px;
	}

	.zone-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.zone-item {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		overflow: hidden;
		transition: border-color 0.15s;
	}

	.zone-item.selected {
		border-color: var(--accent);
	}

	.zone-item-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		cursor: pointer;
		min-height: 48px;
	}

	.zone-dot-sm {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.zone-item-name {
		flex: 1;
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text);
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.zone-type-badge {
		font-size: 0.72rem;
		color: var(--text-muted);
		background: var(--surface-alt, color-mix(in srgb, var(--text) 5%, transparent));
		padding: 2px 7px;
		border-radius: 4px;
		white-space: nowrap;
	}

	.zone-status-badge {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--s-color, var(--text-muted));
		background: color-mix(in srgb, var(--s-color, var(--text-muted)) 12%, transparent);
		padding: 2px 7px;
		border-radius: 4px;
		text-transform: capitalize;
	}

	.zone-item-actions {
		display: flex;
		gap: 6px;
		padding: 8px 12px;
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}
</style>


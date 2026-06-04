<script lang="ts">
	/**
	 * WorkZoneMap — map-v2 version using MapLibre GL JS.
	 * Replaces old Leaflet-based MapContainer/MapPolygon/MapDrawing version.
	 */
	import { onMount } from 'svelte';
	import { MapView, MapPolygon, MapMarker } from '$lib/components/map-v2';
	import { confirmStore } from '$lib/stores/confirm.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';

	interface Props {
		orgId: string;
		siteId: string;
		lat: number;
		lng: number;
		readonly?: boolean;
	}

	let { orgId, siteId, lat, lng, readonly = false }: Props = $props();

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

	// Drawing state
	let drawingMode = $state(false);
	let selectedType = $state<'paving' | 'milling' | 'tack' | 'base' | 'other' | null>(null);
	let drawnPoints = $state<[number, number][]>([]); // [lng, lat] pairs for drawing
	let showZoneForm = $state(false);
	let drawnGeoJson = $state<string | null>(null);
	let selectedZone = $state<WorkZone | null>(null);

	let zoneForm = $state({
		name: '',
		zone_type: 'paving' as 'paving' | 'milling' | 'tack' | 'base' | 'other',
		notes: ''
	});

	let saving = $state(false);

	// Preview polygon coords for in-progress drawing [lat, lng]
	const previewCoords = $derived<[number, number][]>(
		drawnPoints.map((p) => [p[1], p[0]])
	);

	async function loadZones() {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/org/${orgId}/job-sites/${siteId}/work-zones`, {
				credentials: 'include'
			});
			if (!res.ok) {
				throw new Error('Failed to load work zones');
			}
			const data: { work_zones: WorkZone[] } = await res.json();
			zones = data.work_zones || [];
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load zones';
		} finally {
			loading = false;
		}
	}

	function startDrawing(type: 'paving' | 'milling' | 'tack' | 'base' | 'other') {
		if (readonly) return;
		selectedType = type;
		drawingMode = true;
		drawnPoints = [];
		drawnGeoJson = null;
		showZoneForm = false;
		if (mapInstance) {
			mapInstance.getCanvas().style.cursor = 'crosshair';
		}
	}

	function finishDrawing() {
		if (drawnPoints.length < 3) {
			toastStore.error('Draw at least 3 points to create a polygon');
			return;
		}
		// Close polygon
		const closed = [...drawnPoints, drawnPoints[0]];
		const geojson = JSON.stringify({
			type: 'FeatureCollection',
			features: [{
				type: 'Feature',
				geometry: {
					type: 'Polygon',
					coordinates: [closed]
				},
				properties: {}
			}]
		});
		drawnGeoJson = geojson;
		drawingMode = false;
		showZoneForm = true;
		zoneForm.zone_type = selectedType!;
		zoneForm.name = '';
		zoneForm.notes = '';
		if (mapInstance) {
			mapInstance.getCanvas().style.cursor = '';
		}
	}

	function cancelDrawing() {
		drawingMode = false;
		selectedType = null;
		drawnPoints = [];
		drawnGeoJson = null;
		showZoneForm = false;
		if (mapInstance) {
			mapInstance.getCanvas().style.cursor = '';
		}
	}

	function handleMapReady(map: MapLibreMap) {
		mapInstance = map;
		map.on('click', (e) => {
			if (!drawingMode) return;
			drawnPoints = [...drawnPoints, [e.lngLat.lng, e.lngLat.lat]];
		});
	}

	async function saveZone() {
		if (!drawnGeoJson || !zoneForm.name) return;
		saving = true;
		try {
			const res = await fetch(`/api/org/${orgId}/job-sites/${siteId}/work-zones`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					name: zoneForm.name,
					zone_type: zoneForm.zone_type,
					geometry_geojson: drawnGeoJson,
					color: ZONE_TYPE_COLORS[zoneForm.zone_type],
					notes: zoneForm.notes || null
				})
			});
			if (!res.ok) {
				toastStore.error('Failed to create work zone');
				throw new Error('Failed to create work zone');
			}
			await loadZones();
			cancelDrawing();
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
			if (!res.ok) {
				toastStore.error('Failed to update zone status');
				throw new Error('Failed to update zone status');
			}
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
			if (!res.ok) {
				toastStore.error('Failed to delete zone');
				throw new Error('Failed to delete zone');
			}
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

	function parseGeoJsonCoords(geoJsonStr: string | null): [number, number][] {
		if (!geoJsonStr) return [];
		try {
			const parsed = JSON.parse(geoJsonStr);
			let feature = null;
			if (parsed.type === 'FeatureCollection' && parsed.features.length > 0) {
				feature = parsed.features[0];
			} else if (parsed.type === 'Feature') {
				feature = parsed;
			} else if (parsed.type === 'Polygon') {
				return parsed.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
			}
			if (feature?.geometry?.type === 'Polygon') {
				return feature.geometry.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
			}
		} catch (err) {
			console.error('Failed to parse GeoJSON:', err);
		}
		return [];
	}

	onMount(() => {
		loadZones();
	});
</script>

<div class="work-zone-map">
	{#if loading}
		<div class="loading-state">Loading work zones...</div>
	{:else if error}
		<div class="error-state">{error}</div>
	{/if}

	<div class="map-container">
		<MapView
			center={[lat, lng]}
			zoom={15}
			height="500px"
			onready={handleMapReady}
		>
			{#snippet layers()}
				{#each zones as zone (zone.id)}
					{@const coords = parseGeoJsonCoords(zone.geometry_geojson)}
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
				<!-- In-progress drawing preview -->
				{#if drawingMode && previewCoords.length >= 3}
					<MapPolygon
						id="drawing-preview"
						coordinates={previewCoords}
						color="#8b5cf6"
						opacity={0.9}
						fillOpacity={0.15}
					/>
				{/if}
				<!-- Drawing point markers -->
				{#if drawingMode}
					{#each drawnPoints as pt, i (i)}
						<MapMarker
							lat={pt[1]}
							lng={pt[0]}
							color="#8b5cf6"
							label={String(i + 1)}
						/>
					{/each}
				{/if}
			{/snippet}
		</MapView>

		{#if drawingMode}
			<div class="draw-overlay">
				<span>Tap to add points ({drawnPoints.length} added)</span>
				<button class="draw-done-btn" onclick={finishDrawing} disabled={drawnPoints.length < 3}>
					Done ({drawnPoints.length} pts)
				</button>
				<button class="draw-cancel-btn" onclick={cancelDrawing}>Cancel</button>
			</div>
		{/if}
	</div>

	{#if !readonly}
		<div class="toolbar">
			{#each Object.entries(ZONE_TYPE_LABELS) as [type, label]}
				<button
					class="zone-type-btn"
					class:active={selectedType === type}
					onclick={() => startDrawing(type as 'paving' | 'milling' | 'tack' | 'base' | 'other')}
					style="--zone-color: {ZONE_TYPE_COLORS[type]}"
					disabled={drawingMode}
				>
					<span class="zone-dot" style="background:{ZONE_TYPE_COLORS[type]}"></span>
					{label}
				</button>
			{/each}
		</div>
	{/if}

	{#if showZoneForm}
		<div class="zone-form-panel">
			<h4>New Work Zone</h4>
			<div class="form-row">
				<label class="form-label" for="zone-name">Zone Name</label>
				<input
					id="zone-name"
					class="form-input"
					type="text"
					placeholder="e.g. North Approach"
					bind:value={zoneForm.name}
				/>
			</div>
			<div class="form-row">
				<label class="form-label" for="zone-notes">Notes (optional)</label>
				<textarea
					id="zone-notes"
					class="form-input form-textarea"
					placeholder="Any notes about this zone..."
					bind:value={zoneForm.notes}
				></textarea>
			</div>
			<div class="form-actions">
				<button class="btn-save" onclick={saveZone} disabled={saving || !zoneForm.name}>
					{saving ? 'Saving...' : 'Save Zone'}
				</button>
				<button class="btn-cancel" onclick={cancelDrawing}>Cancel</button>
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
						onclick={() => selectedZone = selectedZone?.id === zone.id ? null : zone}
						onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedZone = selectedZone?.id === zone.id ? null : zone; } }}
					>
						<span class="zone-dot-sm" style="background:{zone.color || ZONE_TYPE_COLORS[zone.zone_type]}"></span>
						<span class="zone-item-name">{zone.name}</span>
						<span class="zone-type-badge">{ZONE_TYPE_LABELS[zone.zone_type]}</span>
						<span class="zone-status-badge" style="--s-color:{zone.status === 'complete' ? '#22c55e' : zone.status === 'active' ? '#f2c037' : zone.status === 'hold' ? '#ef4444' : '#94a3b8'}">
							{zone.status}
						</span>
					</div>
					{#if selectedZone?.id === zone.id}
						<div class="zone-item-actions">
							{#if !readonly}
								<button onclick={() => updateZoneStatus(zone.id, 'active')} class="status-btn" disabled={zone.status === 'active' || saving}>Active</button>
								<button onclick={() => updateZoneStatus(zone.id, 'complete')} class="status-btn complete" disabled={zone.status === 'complete' || saving}>Complete</button>
								<button onclick={() => updateZoneStatus(zone.id, 'hold')} class="status-btn hold" disabled={zone.status === 'hold' || saving}>Hold</button>
								<button onclick={() => deleteZone(zone.id)} class="status-btn delete" disabled={saving}>Delete</button>
							{/if}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.work-zone-map {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.loading-state,
	.error-state {
		padding: 12px 16px;
		background: var(--surface);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.875rem;
	}

	.error-state {
		color: #ef4444;
	}

	.map-container {
		position: relative;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
	}

	.draw-overlay {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: rgba(0, 0, 0, 0.8);
		border-radius: 24px;
		z-index: 400;
		color: #fff;
		font-size: 0.8rem;
		font-weight: 600;
		backdrop-filter: blur(4px);
		white-space: nowrap;
	}

	.draw-done-btn {
		min-height: 32px;
		padding: 0 12px;
		background: #22c55e;
		border: none;
		border-radius: 6px;
		color: #000;
		font-size: 0.78rem;
		font-weight: 700;
		cursor: pointer;
	}

	.draw-done-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.draw-cancel-btn {
		min-height: 32px;
		padding: 0 12px;
		background: rgba(255, 255, 255, 0.15);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 6px;
		color: #fff;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.zone-type-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 0 14px;
		background: var(--surface);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s, background 0.15s;
	}

	.zone-type-btn.active,
	.zone-type-btn:hover:not(:disabled) {
		border-color: var(--zone-color);
		color: var(--text);
		background: color-mix(in srgb, var(--zone-color) 12%, var(--surface));
	}

	.zone-type-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
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
		margin: 0 0 12px;
		font-size: 0.95rem;
		color: var(--text);
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
		background: var(--input-bg, var(--surface-alt, #1a2530));
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

	.btn-save {
		flex: 1;
		min-height: 44px;
		background: var(--accent);
		border: none;
		border-radius: var(--radius);
		color: #000;
		font-size: 0.9rem;
		font-weight: 700;
		cursor: pointer;
	}

	.btn-save:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.btn-cancel {
		min-height: 44px;
		padding: 0 16px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-size: 0.9rem;
		cursor: pointer;
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
	}

	.zone-type-badge {
		font-size: 0.72rem;
		color: var(--text-muted);
		background: var(--surface-alt, rgba(255,255,255,0.05));
		padding: 2px 7px;
		border-radius: 4px;
	}

	.zone-status-badge {
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--s-color, #94a3b8);
		background: color-mix(in srgb, var(--s-color, #94a3b8) 12%, transparent);
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

	.status-btn {
		min-height: 36px;
		padding: 0 12px;
		background: var(--surface-alt, rgba(255,255,255,0.05));
		border: 1px solid var(--border);
		border-radius: 6px;
		color: var(--text-muted);
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}

	.status-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.status-btn.complete {
		color: #22c55e;
		border-color: #22c55e;
	}

	.status-btn.hold {
		color: #ef4444;
		border-color: #ef4444;
	}

	.status-btn.delete {
		color: #ef4444;
	}

	.status-btn.delete:not(:disabled):hover {
		background: rgba(239, 68, 68, 0.12);
	}
</style>

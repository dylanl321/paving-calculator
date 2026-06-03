<script lang="ts">
	import { onMount } from 'svelte';
	import L from 'leaflet';
	import MapContainer from '$lib/components/map/MapContainer.svelte';
	import MapPolygon from '$lib/components/map/MapPolygon.svelte';
	import MapDrawing from '$lib/components/map/MapDrawing.svelte';

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

	const STATUS_COLORS: Record<string, string> = {
		pending: '#94a3b8',
		active: '#f2c037',
		complete: '#22c55e',
		hold: '#ef4444'
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
	let map = $state<L.Map | undefined>(undefined);
	let drawingMode = $state<'polyline' | 'polygon' | 'point' | 'none'>('none');
	let selectedType = $state<'paving' | 'milling' | 'tack' | 'base' | 'other' | null>(null);
	let drawnGeoJson = $state<string | null>(null);
	let showZoneForm = $state(false);
	let selectedZone = $state<WorkZone | null>(null);

	let zoneForm = $state({
		name: '',
		zone_type: 'paving' as 'paving' | 'milling' | 'tack' | 'base' | 'other',
		notes: ''
	});

	let saving = $state(false);

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
		drawingMode = 'polygon';
		drawnGeoJson = null;
		showZoneForm = false;
	}

	function handleDrawingChange(geojson: string) {
		drawnGeoJson = geojson;
		if (geojson && selectedType) {
			// Polygon completed, show form
			showZoneForm = true;
			drawingMode = 'none';
			zoneForm.zone_type = selectedType;
			zoneForm.name = '';
			zoneForm.notes = '';
		}
	}

	function cancelDrawing() {
		drawingMode = 'none';
		selectedType = null;
		drawnGeoJson = null;
		showZoneForm = false;
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
				throw new Error('Failed to create work zone');
			}

			await loadZones();
			cancelDrawing();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to save zone';
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
				throw new Error('Failed to update zone status');
			}

			await loadZones();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to update zone';
		} finally {
			saving = false;
		}
	}

	async function deleteZone(zoneId: number) {
		if (!confirm('Delete this work zone?')) return;

		saving = true;
		try {
			const res = await fetch(`/api/org/${orgId}/job-sites/${siteId}/work-zones/${zoneId}`, {
				method: 'DELETE',
				credentials: 'include'
			});

			if (!res.ok) {
				throw new Error('Failed to delete zone');
			}

			await loadZones();
			selectedZone = null;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to delete zone';
		} finally {
			saving = false;
		}
	}

	function parseGeoJson(geoJsonStr: string | null): [number, number][] {
		if (!geoJsonStr) return [];
		try {
			const parsed = JSON.parse(geoJsonStr);
			if (parsed.type === 'FeatureCollection' && parsed.features.length > 0) {
				const feature = parsed.features[0];
				if (feature.geometry.type === 'Polygon') {
					return feature.geometry.coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
				}
			}
		} catch (err) {
			console.error('Failed to parse GeoJSON:', err);
		}
		return [];
	}

	function handleZoneClick(zone: WorkZone) {
		selectedZone = zone;
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

	<MapContainer center={[lat, lng]} zoom={15} height="500px" bind:map>
		{#if map}
			{#each zones as zone}
				{@const points = parseGeoJson(zone.geometry_geojson)}
				{#if points.length > 0}
					<MapPolygon
						points={points}
						color={zone.color || ZONE_TYPE_COLORS[zone.zone_type]}
						fillColor={zone.color || ZONE_TYPE_COLORS[zone.zone_type]}
						fillOpacity={0.3}
						weight={2}
					/>
				{/if}
			{/each}

			{#if drawingMode !== 'none'}
				<MapDrawing {map} mode={drawingMode} onchange={handleDrawingChange} />
			{/if}
		{/if}
	</MapContainer>

	{#if !readonly}
		<div class="toolbar">
			<button
				class="zone-type-btn"
				class:active={selectedType === 'paving'}
				onclick={() => startDrawing('paving')}
				style="--zone-color: {ZONE_TYPE_COLORS.paving}"
				disabled={drawingMode !== 'none'}
			>
				Paving
			</button>
			<button
				class="zone-type-btn"
				class:active={selectedType === 'milling'}
				onclick={() => startDrawing('milling')}
				style="--zone-color: {ZONE_TYPE_COLORS.milling}"
				disabled={drawingMode !== 'none'}
			>
				Milling
			</button>
			<button
				class="zone-type-btn"
				class:active={selectedType === 'tack'}
				onclick={() => startDrawing('tack')}
				style="--zone-color: {ZONE_TYPE_COLORS.tack}"
				disabled={drawingMode !== 'none'}
			>
				Tack
			</button>
			<button
				class="zone-type-btn"
				class:active={selectedType === 'base'}
				onclick={() => startDrawing('base')}
				style="--zone-color: {ZONE_TYPE_COLORS.base}"
				disabled={drawingMode !== 'none'}
			>
				Base
			</button>
			<button
				class="zone-type-btn"
				class:active={selectedType === 'other'}
				onclick={() => startDrawing('other')}
				style="--zone-color: {ZONE_TYPE_COLORS.other}"
				disabled={drawingMode !== 'none'}
			>
				Other
			</button>
		</div>

		{#if drawingMode !== 'none'}
			<div class="drawing-hint">
				Tap the map to add points. Double-tap to finish the polygon.
				<button class="btn-cancel" onclick={cancelDrawing}>Cancel</button>
			</div>
		{/if}

		{#if showZoneForm}
			<div class="zone-form-overlay" onclick={cancelDrawing}>
				<div class="zone-form" onclick={(e) => e.stopPropagation()}>
					<h3>New {ZONE_TYPE_LABELS[zoneForm.zone_type]} Zone</h3>
					<div class="form-group">
						<label for="zone-name">Zone Name</label>
						<input
							type="text"
							id="zone-name"
							bind:value={zoneForm.name}
							placeholder="e.g., Zone A - North Paving"
						/>
					</div>
					<div class="form-group">
						<label for="zone-notes">Notes (optional)</label>
						<textarea
							id="zone-notes"
							bind:value={zoneForm.notes}
							rows="3"
							placeholder="Additional notes..."
						></textarea>
					</div>
					<div class="form-actions">
						<button class="btn-primary" onclick={saveZone} disabled={!zoneForm.name || saving}>
							{saving ? 'Saving...' : 'Save Zone'}
						</button>
						<button class="btn-ghost" onclick={cancelDrawing}>Cancel</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}

	<div class="zone-list">
		<h4>Work Zones</h4>
		{#if zones.length === 0}
			<p class="empty-state">No work zones yet. Draw zones on the map to get started.</p>
		{:else}
			{#each zones as zone}
				<div class="zone-card" onclick={() => handleZoneClick(zone)}>
					<div
						class="zone-color-indicator"
						style="background: {zone.color || ZONE_TYPE_COLORS[zone.zone_type]}"
					></div>
					<div class="zone-info">
						<div class="zone-name">{zone.name}</div>
						<div class="zone-type-label">{ZONE_TYPE_LABELS[zone.zone_type]}</div>
					</div>
					<div class="zone-status">
						<select
							class="status-select"
							value={zone.status}
							onchange={(e) => updateZoneStatus(zone.id, e.currentTarget.value as any)}
							disabled={readonly || saving}
							onclick={(e) => e.stopPropagation()}
						>
							<option value="pending">Pending</option>
							<option value="active">Active</option>
							<option value="complete">Complete</option>
							<option value="hold">Hold</option>
						</select>
					</div>
					{#if !readonly}
						<button
							class="btn-delete"
							onclick={(e) => {
								e.stopPropagation();
								deleteZone(zone.id);
							}}
							disabled={saving}
							aria-label="Delete zone"
						>
							<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<line x1="18" y1="6" x2="6" y2="18"></line>
								<line x1="6" y1="6" x2="18" y2="18"></line>
							</svg>
						</button>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.work-zone-map {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.loading-state,
	.error-state {
		padding: 20px;
		text-align: center;
		color: var(--text-muted);
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.error-state {
		color: var(--warn);
	}

	.toolbar {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		padding: 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.zone-type-btn {
		min-height: 48px;
		padding: 12px 20px;
		background: var(--bg);
		border: 2px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s;
		flex: 1;
		min-width: 100px;
	}

	.zone-type-btn:hover:not(:disabled) {
		border-color: var(--zone-color, var(--accent));
	}

	.zone-type-btn.active {
		background: var(--zone-color, var(--accent));
		color: var(--accent-text);
		border-color: var(--zone-color, var(--accent));
	}

	.zone-type-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.drawing-hint {
		padding: 12px 16px;
		background: var(--accent);
		color: var(--accent-text);
		border-radius: var(--radius);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		font-size: 0.9rem;
	}

	.btn-cancel {
		min-height: 40px;
		padding: 8px 16px;
		background: rgba(255, 255, 255, 0.2);
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: var(--radius);
		color: var(--accent-text);
		font-weight: 600;
		cursor: pointer;
	}

	.zone-form-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-end;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.zone-form {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius) var(--radius) 0 0;
		padding: 24px;
		width: 100%;
		max-width: 500px;
		box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
	}

	.zone-form h3 {
		margin: 0 0 20px;
		font-size: 1.2rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 16px;
	}

	.form-group label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
	}

	.form-group input,
	.form-group textarea {
		min-height: 48px;
		padding: 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.95rem;
	}

	.form-group textarea {
		min-height: 80px;
		resize: vertical;
	}

	.form-actions {
		display: flex;
		gap: 12px;
		margin-top: 20px;
	}

	.btn-primary {
		flex: 1;
		min-height: 48px;
		padding: 12px 20px;
		background: var(--accent);
		color: var(--accent-text);
		border: none;
		border-radius: var(--radius);
		font-weight: 600;
		cursor: pointer;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-ghost {
		min-height: 48px;
		padding: 12px 20px;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		font-weight: 600;
		cursor: pointer;
	}

	.zone-list {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 20px;
	}

	.zone-list h4 {
		margin: 0 0 16px;
		font-size: 1.05rem;
	}

	.empty-state {
		margin: 0;
		padding: 20px;
		text-align: center;
		color: var(--text-muted);
		font-size: 0.9rem;
	}

	.zone-card {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		margin-bottom: 8px;
		cursor: pointer;
		transition: border-color 0.2s;
	}

	.zone-card:hover {
		border-color: var(--accent);
	}

	.zone-color-indicator {
		width: 40px;
		height: 40px;
		border-radius: 6px;
		flex-shrink: 0;
	}

	.zone-info {
		flex: 1;
		min-width: 0;
	}

	.zone-name {
		font-weight: 600;
		margin-bottom: 2px;
	}

	.zone-type-label {
		font-size: 0.8rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.zone-status {
		flex-shrink: 0;
	}

	.status-select {
		min-height: 40px;
		padding: 8px 12px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text);
		font-size: 0.85rem;
		cursor: pointer;
	}

	.status-select:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-delete {
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		color: var(--text-muted);
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.btn-delete:hover:not(:disabled) {
		background: var(--warn);
		border-color: var(--warn);
		color: white;
	}

	.btn-delete:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 640px) {
		.toolbar {
			gap: 6px;
		}

		.zone-type-btn {
			min-width: 80px;
			padding: 10px 12px;
			font-size: 0.85rem;
		}

		.zone-form-overlay {
			padding: 0;
			align-items: flex-end;
		}

		.zone-form {
			max-width: 100%;
			border-radius: var(--radius) var(--radius) 0 0;
		}
	}
</style>

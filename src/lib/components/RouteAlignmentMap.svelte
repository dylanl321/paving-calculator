<script lang="ts">
	import { onDestroy } from 'svelte';
	import type L from 'leaflet';
	import { MapContainer, MapMarker, MapPolyline, MapPolygon, MapCircleMarker } from '$lib/components/map';

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

	interface Props {
		site: SitePin;
		initialWaypoints?: Waypoint[];
		numLanes?: number | null;
		laneWidthFt?: number | null;
		height?: string;
		onRouteSave?: (waypoints: Waypoint[]) => Promise<void>;
	}

	let {
		site,
		initialWaypoints = [],
		numLanes = null,
		laneWidthFt = null,
		height = '400px',
		onRouteSave
	}: Props = $props();

	let mapInstance: L.Map | null = null;
	let waypoints = $state<Waypoint[]>([...initialWaypoints]);
	let drawMode = $state(false);
	let saving = $state(false);

	const isMobile = $derived(
		typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
	);

	const STATUS_COLORS: Record<string, string> = {
		active: '#22c55e',
		completed: '#94a3b8',
		archived: '#475569'
	};

	const pinned = $derived(site.latitude != null && site.longitude != null);

	const totalLengthFt = $derived.by(() => {
		if (waypoints.length < 2) return 0;

		let totalMeters = 0;
		for (let i = 0; i < waypoints.length - 1; i++) {
			const from = waypoints[i];
			const to = waypoints[i + 1];
			totalMeters += haversineDistance(from.lat, from.lng, to.lat, to.lng);
		}

		return totalMeters * 3.28084;
	});

	function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
		const R = 6371000;
		const φ1 = (lat1 * Math.PI) / 180;
		const φ2 = (lat2 * Math.PI) / 180;
		const Δφ = ((lat2 - lat1) * Math.PI) / 180;
		const Δλ = ((lon2 - lon1) * Math.PI) / 180;

		const a =
			Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
			Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

		return R * c;
	}

	function computeBufferPolygon(wps: Waypoint[], widthMeters: number): [number, number][] {
		if (wps.length < 2) return [];

		const halfWidth = widthMeters / 2;
		const leftSide: [number, number][] = [];
		const rightSide: [number, number][] = [];

		for (let i = 0; i < wps.length; i++) {
			const curr = wps[i];
			let perpAngle: number;

			if (i === 0) {
				const next = wps[i + 1];
				perpAngle = Math.atan2(next.lat - curr.lat, next.lng - curr.lng);
			} else if (i === wps.length - 1) {
				const prev = wps[i - 1];
				perpAngle = Math.atan2(curr.lat - prev.lat, curr.lng - prev.lng);
			} else {
				const prev = wps[i - 1];
				const next = wps[i + 1];
				const angle1 = Math.atan2(curr.lat - prev.lat, curr.lng - prev.lng);
				const angle2 = Math.atan2(next.lat - curr.lat, next.lng - curr.lng);
				perpAngle = (angle1 + angle2) / 2;
			}

			const latOffsetPerMeter = 1 / 111320;
			const lngOffsetPerMeter = 1 / (111320 * Math.cos((curr.lat * Math.PI) / 180));

			const perpLat = Math.sin(perpAngle + Math.PI / 2);
			const perpLng = Math.cos(perpAngle + Math.PI / 2);

			leftSide.push([
				curr.lat + perpLat * halfWidth * latOffsetPerMeter,
				curr.lng + perpLng * halfWidth * lngOffsetPerMeter
			]);
			rightSide.push([
				curr.lat - perpLat * halfWidth * latOffsetPerMeter,
				curr.lng - perpLng * halfWidth * lngOffsetPerMeter
			]);
		}

		return [...leftSide, ...rightSide.reverse()];
	}

	const color = $derived(STATUS_COLORS[site.status] ?? STATUS_COLORS.active);

	const sitePinSvg = $derived(
		`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
				<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
				<circle cx="14" cy="14" r="5" fill="#fff"/>
			</svg>`
	);

	const sitePopupHtml = $derived.by(() => {
		const statusLabel = site.status.charAt(0).toUpperCase() + site.status.slice(1);
		return `<div style="min-width:160px;font-family:system-ui,sans-serif">
				<strong style="font-size:0.95rem">${site.name}</strong><br>
				<span style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>
				${site.location_description ? `<br><span style="font-size:0.8rem;color:#666">${site.location_description}</span>` : ''}
			</div>`;
	});

	const routePoints = $derived<[number, number][]>(waypoints.map((wp) => [wp.lat, wp.lng]));

	const bufferCoords = $derived.by<[number, number][]>(() => {
		if (waypoints.length < 2 || !numLanes || !laneWidthFt || numLanes <= 0 || laneWidthFt <= 0)
			return [];
		const totalWidthMeters = numLanes * laneWidthFt * 0.3048;
		return computeBufferPolygon(waypoints, totalWidthMeters);
	});

	function handleMapReady(map: L.Map) {
		mapInstance = map;
		map.setView([site.latitude as number, site.longitude as number], 15);
		map.on('click', (e: L.LeafletMouseEvent) => {
			if (drawMode && !isMobile) {
				waypoints = [...waypoints, { lat: e.latlng.lat, lng: e.latlng.lng }];
			}
		});
	}

	function toggleDrawMode() {
		drawMode = !drawMode;
		if (mapInstance) {
			mapInstance.getContainer().style.cursor = drawMode ? 'crosshair' : '';
		}
	}

	function addPointAtCenter() {
		if (!mapInstance || !drawMode) return;
		const center = mapInstance.getCenter();
		waypoints = [...waypoints, { lat: center.lat, lng: center.lng }];
	}

	function clearRoute() {
		waypoints = [];
	}

	async function saveRoute() {
		if (!onRouteSave) return;
		saving = true;
		try {
			await onRouteSave(waypoints);
		} catch (err) {
			console.error('Failed to save route:', err);
		} finally {
			saving = false;
		}
	}

	onDestroy(() => {
		mapInstance = null;
	});
</script>

{#if !pinned}
	<div class="empty-map">
		<svg
			width="32"
			height="32"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"
		>
			<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
			<circle cx="12" cy="10" r="3"></circle>
		</svg>
		<p>No coordinates set — edit job site to add a location.</p>
	</div>
{:else}
	<div class="map-wrap" style="height:{height}">
		<MapContainer
			class="route-map"
			{height}
			center={[site.latitude as number, site.longitude as number]}
			zoom={15}
			onready={handleMapReady}
		>
			<MapMarker
				lat={site.latitude as number}
				lng={site.longitude as number}
				title={site.name}
				{color}
				popupHtml={sitePopupHtml}
				popupMinWidth={160}
			/>

			{#if waypoints.length >= 2}
				<MapPolyline points={routePoints} color="#f2c037" weight={3} />
				{#if bufferCoords.length > 0}
					<MapPolygon
						points={bufferCoords}
						color="rgba(242, 192, 55, 0.4)"
						fillColor="rgba(242, 192, 55, 0.15)"
						fillOpacity={1}
						weight={1}
					/>
				{/if}
			{/if}

			{#if drawMode}
				{#each waypoints as wp, i (i)}
					<MapCircleMarker
						lat={wp.lat}
						lng={wp.lng}
						radius={5}
						color="#f2c037"
						fillColor="#f2c037"
						fillOpacity={1}
						weight={2}
					/>
				{/each}
			{/if}
		</MapContainer>

		<div class="map-controls">
			<button
				class="map-btn"
				class:active={drawMode}
				onclick={toggleDrawMode}
				title={drawMode ? 'Stop drawing' : 'Draw route'}
			>
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
					<path
						d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"
					></path>
				</svg>
				{drawMode ? 'Stop' : 'Draw Route'}
			</button>

			{#if drawMode && isMobile}
				<button class="map-btn" onclick={addPointAtCenter} title="Add point at center">
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
						<circle cx="12" cy="12" r="10"></circle>
						<line x1="12" y1="8" x2="12" y2="16"></line>
						<line x1="8" y1="12" x2="16" y2="12"></line>
					</svg>
					Add Point
				</button>
			{/if}

			{#if waypoints.length > 0}
				<button class="map-btn map-btn-warn" onclick={clearRoute} title="Clear route">
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
						<polyline points="3 6 5 6 21 6"></polyline>
						<path
							d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
						></path>
					</svg>
					Clear
				</button>

				{#if onRouteSave}
					<button
						class="map-btn map-btn-primary"
						onclick={saveRoute}
						disabled={saving}
						title="Save route"
					>
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
							<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
							<polyline points="17 21 17 13 7 13 7 21"></polyline>
							<polyline points="7 3 7 8 15 8"></polyline>
						</svg>
						{saving ? 'Saving...' : 'Save Route'}
					</button>
				{/if}
			{/if}
		</div>

		{#if waypoints.length > 0}
			<div class="route-stats">
				<div class="stat">
					<span class="stat-label">Length</span>
					<span class="stat-value">{totalLengthFt.toFixed(0)} ft</span>
				</div>
				<div class="stat">
					<span class="stat-label">Points</span>
					<span class="stat-value">{waypoints.length}</span>
				</div>
			</div>
		{/if}

		{#if drawMode && isMobile}
			<div class="crosshair">+</div>
		{/if}
	</div>
{/if}

<style>
	.map-wrap {
		position: relative;
		width: 100%;
		border-radius: var(--radius-md, 12px);
		overflow: hidden;
		border: 1px solid var(--border);
	}

	.map-wrap :global(.route-map) {
		height: 100%;
		border-radius: 0;
	}

	.empty-map {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 40px 20px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-md, 12px);
		color: var(--text-muted);
		text-align: center;
	}

	.empty-map svg {
		opacity: 0.4;
	}

	.empty-map p {
		margin: 0;
		font-size: 0.875rem;
	}

	.map-controls {
		position: absolute;
		top: 12px;
		right: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		z-index: 500;
	}

	.map-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 48px;
		padding: 0 14px;
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.map-btn:hover:not(:disabled) {
		background: var(--surface-alt);
		border-color: var(--accent);
	}

	.map-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.map-btn.active {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.map-btn-warn {
		border-color: var(--warn);
		color: var(--warn);
	}

	.map-btn-warn:hover:not(:disabled) {
		background: var(--warn);
		color: white;
	}

	.map-btn-primary {
		background: var(--accent);
		color: var(--accent-text);
		border-color: var(--accent);
	}

	.map-btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.route-stats {
		position: absolute;
		bottom: 12px;
		left: 12px;
		display: flex;
		gap: 12px;
		z-index: 500;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 10px 14px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.stat-label {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--text-muted);
	}

	.stat-value {
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--accent);
	}

	.crosshair {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		font-size: 48px;
		font-weight: 300;
		color: var(--accent);
		pointer-events: none;
		z-index: 450;
		text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
	}

	@media (max-width: 640px) {
		.map-controls {
			top: 8px;
			right: 8px;
			gap: 6px;
		}

		.map-btn {
			min-height: 44px;
			padding: 0 12px;
			font-size: 0.8rem;
		}

		.route-stats {
			bottom: 8px;
			left: 8px;
			padding: 8px 12px;
			gap: 10px;
		}
	}
</style>

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import L from 'leaflet';
	import 'leaflet/dist/leaflet.css';

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

	let mapEl: HTMLDivElement;
	let mapInstance: L.Map | null = null;
	let waypoints = $state<Waypoint[]>([...initialWaypoints]);
	let drawMode = $state(false);
	let saving = $state(false);
	let routePolyline: L.Polyline | null = null;
	let bufferPolygon: L.Polygon | null = null;
	let waypointMarkers: L.CircleMarker[] = [];

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

	function computeBufferPolygon(waypoints: Waypoint[], widthMeters: number): [number, number][] {
		if (waypoints.length < 2) return [];

		const halfWidth = widthMeters / 2;
		const leftSide: [number, number][] = [];
		const rightSide: [number, number][] = [];

		for (let i = 0; i < waypoints.length; i++) {
			const curr = waypoints[i];
			let perpAngle: number;

			if (i === 0) {
				const next = waypoints[i + 1];
				perpAngle = Math.atan2(next.lat - curr.lat, next.lng - curr.lng);
			} else if (i === waypoints.length - 1) {
				const prev = waypoints[i - 1];
				perpAngle = Math.atan2(curr.lat - prev.lat, curr.lng - prev.lng);
			} else {
				const prev = waypoints[i - 1];
				const next = waypoints[i + 1];
				const angle1 = Math.atan2(curr.lat - prev.lat, curr.lng - prev.lng);
				const angle2 = Math.atan2(next.lat - curr.lat, next.lng - curr.lng);
				perpAngle = (angle1 + angle2) / 2;
			}

			const latOffsetPerMeter = 1 / 111320;
			const lngOffsetPerMeter = 1 / (111320 * Math.cos((curr.lat * Math.PI) / 180));

			const perpLat = Math.sin(perpAngle + Math.PI / 2);
			const perpLng = Math.cos(perpAngle + Math.PI / 2);

			const leftLat = curr.lat + perpLat * halfWidth * latOffsetPerMeter;
			const leftLng = curr.lng + perpLng * halfWidth * lngOffsetPerMeter;

			const rightLat = curr.lat - perpLat * halfWidth * latOffsetPerMeter;
			const rightLng = curr.lng - perpLng * halfWidth * lngOffsetPerMeter;

			leftSide.push([leftLat, leftLng]);
			rightSide.push([rightLat, rightLng]);
		}

		return [...leftSide, ...rightSide.reverse()];
	}

	function updateRouteOverlay() {
		if (!mapInstance) return;
		if (routePolyline) {
			mapInstance.removeLayer(routePolyline);
			routePolyline = null;
		}
		if (bufferPolygon) {
			mapInstance.removeLayer(bufferPolygon);
			bufferPolygon = null;
		}
		for (const marker of waypointMarkers) {
			mapInstance.removeLayer(marker);
		}
		waypointMarkers = [];

		if (waypoints.length === 0) return;

		if (waypoints.length >= 2) {
			routePolyline = L.polyline(
				waypoints.map((wp) => [wp.lat, wp.lng]),
				{
					color: '#f2c037',
					weight: 3
				}
			).addTo(mapInstance);

			if (numLanes && laneWidthFt && numLanes > 0 && laneWidthFt > 0) {
				const totalWidthFt = numLanes * laneWidthFt;
				const totalWidthMeters = totalWidthFt * 0.3048;

				const bufferCoords = computeBufferPolygon(waypoints, totalWidthMeters);
				if (bufferCoords.length > 0) {
					bufferPolygon = L.polygon(bufferCoords, {
						color: 'rgba(242, 192, 55, 0.4)',
						fillColor: 'rgba(242, 192, 55, 0.15)',
						fillOpacity: 1,
						weight: 1
					}).addTo(mapInstance);
				}
			}
		}

		if (drawMode) {
			for (const wp of waypoints) {
				const marker = L.circleMarker([wp.lat, wp.lng], {
					radius: 5,
					color: '#f2c037',
					fillColor: '#f2c037',
					fillOpacity: 1,
					weight: 2
				}).addTo(mapInstance);
				waypointMarkers.push(marker);
			}
		}
	}

	function initMap() {
		if (!browser || !mapEl || !pinned) return;

		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}

		mapInstance = L.map(mapEl, {
			zoomControl: true,
			attributionControl: true
		});

		L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
			maxZoom: 19
		}).addTo(mapInstance);

		const lat = site.latitude as number;
		const lng = site.longitude as number;

		const color = STATUS_COLORS[site.status] ?? STATUS_COLORS.active;
		const icon = L.divIcon({
			html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">
				<path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22S28 23.333 28 14C28 6.268 21.732 0 14 0z" fill="${color}" stroke="#fff" stroke-width="2"/>
				<circle cx="14" cy="14" r="5" fill="#fff"/>
			</svg>`,
			className: '',
			iconSize: [28, 36],
			iconAnchor: [14, 36],
			popupAnchor: [0, -36]
		});

		const statusLabel = site.status.charAt(0).toUpperCase() + site.status.slice(1);
		const popup = L.popup().setContent(
			`<div style="min-width:160px;font-family:system-ui,sans-serif">
				<strong style="font-size:0.95rem">${site.name}</strong><br>
				<span style="display:inline-block;margin:4px 0;padding:2px 8px;border-radius:999px;background:${color};color:#fff;font-size:0.7rem;font-weight:700;text-transform:uppercase">${statusLabel}</span>
				${site.location_description ? `<br><span style="font-size:0.8rem;color:#666">${site.location_description}</span>` : ''}
			</div>`
		);

		L.marker([lat, lng], { icon }).bindPopup(popup).addTo(mapInstance);

		mapInstance.setView([lat, lng], 15);

		updateRouteOverlay(L);

		mapInstance.on('click', (e: any) => {
			if (drawMode && !isMobile) {
				waypoints = [...waypoints, { lat: e.latlng.lat, lng: e.latlng.lng }];
				updateRouteOverlay();
			}
		});
	}

	function toggleDrawMode() {
		drawMode = !drawMode;
		if (mapInstance) {
				if (drawMode) {
				mapInstance.getContainer().style.cursor = 'crosshair';
			} else {
				mapInstance.getContainer().style.cursor = '';
			}
			updateRouteOverlay(L);
		}
	}

	function addPointAtCenter() {
		if (!mapInstance || !drawMode) return;
		const center = mapInstance.getCenter();
		waypoints = [...waypoints, { lat: center.lat, lng: center.lng }];
		updateRouteOverlay(L);
	}

	function clearRoute() {
		waypoints = [];
		if (mapInstance) {
				updateRouteOverlay(L);
		}
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

	onMount(() => {
		if (browser && pinned) {
			initMap();
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
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
		<div bind:this={mapEl} class="map-el"></div>

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

	.map-el {
		width: 100%;
		height: 100%;
	}

	.map-el :global(.leaflet-pane) {
		z-index: 1;
	}
	.map-el :global(.leaflet-top),
	.map-el :global(.leaflet-bottom) {
		z-index: 2;
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

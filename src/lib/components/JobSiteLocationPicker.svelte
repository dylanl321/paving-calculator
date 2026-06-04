<script lang="ts">
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { MapPin, Crosshair, X } from 'lucide-svelte';
	import { searchPlaces, type GeoResult } from '$lib/services/weather';
	import MapView from '$lib/components/map-v2/MapView.svelte';
	import type { Map as MapLibreMap, Marker } from 'maplibre-gl';

	interface Props {
		latitude?: number | null;
		longitude?: number | null;
		onchange?: (lat: number | null, lng: number | null) => void;
		/** Height of the map area */
		mapHeight?: string;
		/** Whether to show map immediately or only after a coordinate is set */
		showMapEager?: boolean;
		class?: string;
	}

	let {
		latitude = $bindable(null),
		longitude = $bindable(null),
		onchange,
		mapHeight = '260px',
		showMapEager = false,
		class: className = ''
	}: Props = $props();

	// Search state
	let query = $state('');
	let results = $state<GeoResult[]>([]);
	let searching = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	// GPS state
	let gpsLoading = $state(false);
	let gpsError = $state('');

	// Map state
	let map: MapLibreMap | null = $state(null);
	let marker: Marker | null = null;
	let mapMounted = $state(false);

	const hasCoords = $derived(latitude != null && longitude != null);
	const showMap = $derived(hasCoords || showMapEager || mapMounted);

	const initialCenter = $derived<[number, number]>(
		latitude != null && longitude != null ? [latitude, longitude] : [39.5, -98.35]
	);
	const initialZoom = $derived(latitude != null ? 13 : 4);

	function onSearchInput() {
		clearTimeout(searchTimer);
		gpsError = '';
		if (query.trim().length < 2) {
			results = [];
			return;
		}
		searchTimer = setTimeout(async () => {
			searching = true;
			try {
				results = await searchPlaces(query);
			} catch {
				results = [];
			} finally {
				searching = false;
			}
		}, 300);
	}

	function pickResult(place: GeoResult) {
		query = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}`;
		results = [];
		setCoords(place.latitude, place.longitude);
	}

	function setCoords(lat: number, lng: number) {
		latitude = lat;
		longitude = lng;
		onchange?.(lat, lng);
		if (browser && !mapMounted) mapMounted = true;
		if (map) {
			updateMarker(lat, lng);
			map.flyTo({ center: [lng, lat], zoom: map.getZoom() < 12 ? 13 : map.getZoom() });
		}
	}

	function clearCoords() {
		latitude = null;
		longitude = null;
		query = '';
		results = [];
		onchange?.(null, null);
		if (marker) {
			marker.remove();
			marker = null;
		}
	}

	async function useGps() {
		if (!browser || !navigator.geolocation) {
			gpsError = 'GPS not available on this device';
			return;
		}
		gpsLoading = true;
		gpsError = '';
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				gpsLoading = false;
				setCoords(pos.coords.latitude, pos.coords.longitude);
				query = '';
			},
			(err) => {
				gpsLoading = false;
				gpsError =
					err.code === 1
						? 'Location permission denied'
						: err.code === 3
							? 'GPS timed out — try again'
							: 'Could not get location';
			},
			{ timeout: 10000, maximumAge: 60000 }
		);
	}

	async function updateMarker(lat: number, lng: number) {
		if (!map) return;
		if (marker) {
			marker.setLngLat([lng, lat]);
			return;
		}
		const { Marker: MarkerClass } = await import('maplibre-gl');
		const el = document.createElement('div');
		el.className = 'jslp-pin';
		marker = new MarkerClass({ element: el, anchor: 'bottom', draggable: true })
			.setLngLat([lng, lat])
			.addTo(map);
		marker.on('dragend', () => {
			const ll = marker!.getLngLat();
			latitude = +ll.lat.toFixed(6);
			longitude = +ll.lng.toFixed(6);
			onchange?.(latitude, longitude);
		});
	}

	function handleReady(m: MapLibreMap) {
		map = m;
		m.on('click', (e) => {
			const lat = +e.lngLat.lat.toFixed(6);
			const lng = +e.lngLat.lng.toFixed(6);
			latitude = lat;
			longitude = lng;
			onchange?.(lat, lng);
			updateMarker(lat, lng);
			query = '';
		});
		if (latitude != null && longitude != null) {
			updateMarker(latitude, longitude);
		}
	}

	onDestroy(() => {
		if (marker) {
			marker.remove();
			marker = null;
		}
	});
</script>

<div class="location-picker {className}">
	<!-- Search row -->
	<div class="search-row">
		<input
			type="search"
			class="search-input"
			placeholder="Search address or city&#8230;"
			bind:value={query}
			oninput={onSearchInput}
			autocomplete="off"
			autocorrect="off"
		/>
		<button
			type="button"
			class="gps-btn"
			onclick={useGps}
			disabled={gpsLoading}
			title="Use my current location"
			aria-label="Use GPS location"
		>
			{#if gpsLoading}
				<span class="spinner" aria-hidden="true"></span>
			{:else}
				<Crosshair size={18} />
			{/if}
		</button>
		{#if hasCoords}
			<button
				type="button"
				class="clear-btn"
				onclick={clearCoords}
				title="Clear location"
				aria-label="Clear location"
			>
				<X size={16} />
			</button>
		{/if}
	</div>

	<!-- Search results dropdown -->
	{#if searching}
		<p class="search-hint">Searching&hellip;</p>
	{:else if results.length > 0}
		<ul class="search-results" role="listbox">
			{#each results as place (place.latitude + ',' + place.longitude)}
				<li role="option" aria-selected="false">
					<button type="button" class="result-btn" onclick={() => pickResult(place)}>
						<MapPin size={14} class="result-icon" />
						<span>
							{place.name}{#if place.admin1}, {place.admin1}{/if}{#if place.country && place.country !== 'United States'}, {place.country}{/if}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if gpsError}
		<p class="gps-error">{gpsError}</p>
	{/if}

	<!-- Map area -->
	{#if showMap}
		<div class="map-wrap" style="height: {mapHeight}">
			<MapView center={initialCenter} zoom={initialZoom} height="100%" onready={handleReady} />
		</div>
	{:else}
		<div class="map-placeholder" role="button" tabindex="0" onclick={() => { mapMounted = true; }} onkeydown={(e) => e.key === 'Enter' && (mapMounted = true)}>
			<MapPin size={24} class="placeholder-icon" />
			<span>Search an address above or tap here to open the map and drop a pin</span>
		</div>
	{/if}

	<!-- Coordinate display -->
	{#if hasCoords}
		<p class="coord-display">
			<MapPin size={12} />
			{latitude?.toFixed(5)}, {longitude?.toFixed(5)}
			<span class="coord-hint">Drag the pin to adjust</span>
		</p>
	{/if}
</div>

<style>
	.location-picker {
		display: flex;
		flex-direction: column;
		gap: var(--sp-2);
	}

	.search-row {
		display: flex;
		gap: var(--sp-2);
		align-items: center;
	}

	.search-input {
		flex: 1;
		min-height: 48px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		padding: 0 var(--sp-3);
		font-size: var(--fs-md);
		font-family: inherit;
	}

	.search-input:focus {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.gps-btn,
	.clear-btn {
		min-width: 48px;
		min-height: 48px;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--text);
		cursor: pointer;
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
	}

	.gps-btn:hover:not(:disabled),
	.clear-btn:hover {
		background: var(--surface-alt, var(--border));
	}

	.gps-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.clear-btn {
		color: var(--text-muted);
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid var(--border);
		border-top-color: var(--accent);
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		display: inline-block;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.search-hint {
		font-size: var(--fs-sm);
		color: var(--text-muted);
		margin: 0;
		padding: var(--sp-1) 0;
	}

	.gps-error {
		font-size: var(--fs-sm);
		color: var(--bad);
		margin: 0;
		padding: var(--sp-1) 0;
	}

	.search-results {
		list-style: none;
		margin: 0;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--surface);
	}

	.result-btn {
		width: 100%;
		text-align: left;
		padding: var(--sp-3) var(--sp-3);
		background: transparent;
		border: 0;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		font-size: var(--fs-sm);
		cursor: pointer;
		min-height: 48px;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		transition: background 0.1s;
	}

	.result-btn:hover {
		background: var(--surface-alt, color-mix(in srgb, var(--accent) 8%, transparent));
	}

	.search-results li:last-child .result-btn {
		border-bottom: 0;
	}

	.map-wrap {
		border-radius: var(--radius-sm);
		overflow: hidden;
		border: 1px solid var(--border);
		position: relative;
	}

	:global(.jslp-pin) {
		width: 24px;
		height: 30px;
		background: var(--accent, #f2c037);
		border-radius: 50% 50% 50% 0;
		transform: rotate(-45deg);
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
		border: 2px solid rgba(255, 255, 255, 0.4);
		cursor: grab;
	}

	.map-placeholder {
		border: 2px dashed var(--border);
		border-radius: var(--radius-sm);
		padding: var(--sp-6) var(--sp-4);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--sp-3);
		color: var(--text-muted);
		font-size: var(--fs-sm);
		text-align: center;
		cursor: pointer;
		min-height: 88px;
		transition: border-color 0.15s, background 0.15s;
	}

	.map-placeholder:hover {
		border-color: var(--accent);
		background: color-mix(in srgb, var(--accent) 5%, transparent);
	}

	.coord-display {
		margin: 0;
		font-size: var(--fs-xs);
		color: var(--text-muted);
		display: flex;
		align-items: center;
		gap: var(--sp-1);
		flex-wrap: wrap;
	}

	.coord-hint {
		color: var(--text-muted);
		opacity: 0.7;
	}
</style>

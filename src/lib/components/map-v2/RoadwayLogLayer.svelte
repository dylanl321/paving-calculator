<script lang="ts">
  /**
   * RoadwayLogLayer — renders roadway log events as interactive MapLibre markers
   * with width-coded route segments along the route polyline.
   *
   * Features:
   *   - Places a marker at the interpolated geographic position of each event
   *     along the route polyline (station-based interpolation via stationToCoordinate)
   *   - Different marker icons per event_type:
   *       width_change      → ruler icon (blue)
   *       side_road         → fork icon (slate)
   *       operation_change  → gear icon (green)
   *       project_start/end → S/E labels (amber)
   *       reference/note    → dot (muted)
   *   - Click marker → popup with event details (milepost, description, width)
   *   - Width-coded polyline segments (one segment per unique roadway_width_ft span)
   *   - Legend showing width → color mapping
   *
   * Must be rendered inside a <MapView> tree.
   */
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getMapContext } from './mapContext.js';
  import { stationToCoordinate } from '$lib/services/mapUtils.js';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  export interface RoadwayLogEventMarker {
    id: string;
    milepost: number;
    station?: number;
    event_type: string;
    description: string;
    roadway_width_ft: number | null;
    is_reference: number | boolean;
    coordinate_geojson?: string | null;
  }

  interface LatLng {
    lat: number;
    lng: number;
  }

  interface Props {
    waypoints: LatLng[];
    events: RoadwayLogEventMarker[];
    visible?: boolean;
  }

  let {
    waypoints,
    events,
    visible = true,
  }: Props = $props();

  // ---- Color palette for event types ----
  function eventColor(type: string): string {
    switch (type) {
      case 'project_start':
      case 'project_end':   return '#f2c037';
      case 'width_change':  return '#60a5fa';
      case 'operation_change': return '#34d399';
      case 'side_road':     return '#cbd5e1';
      case 'reference':     return '#94a3b8';
      default:              return '#94a3b8';
    }
  }

  // Width-based segment colors (same palette as RoadProgressLayer)
  const WIDTH_COLORS: [number, string][] = [
    [0,   '#475569'], // unknown / very narrow
    [20,  '#3b82f6'], // blue  — 20 ft
    [24,  '#22c55e'], // green — 24 ft
    [30,  '#f59e0b'], // amber — 30 ft
    [36,  '#ef4444'], // red   — 36+ ft
  ];

  function widthColor(widthFt: number | null): string {
    if (widthFt == null) return WIDTH_COLORS[0][1];
    for (let i = WIDTH_COLORS.length - 1; i >= 0; i--) {
      if (widthFt >= WIDTH_COLORS[i][0]) return WIDTH_COLORS[i][1];
    }
    return WIDTH_COLORS[0][1];
  }

  // SVG icon per event type (24×24 viewBox, inline)
  function markerSvgIcon(type: string): string {
    switch (type) {
      case 'width_change':
        // ruler
        return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><path d="M22 5H2l5 7-5 7h20V5z"/><line x1="8" y1="5" x2="8" y2="12"/><line x1="14" y1="5" x2="14" y2="12"/></svg>`;
      case 'side_road':
        // git-branch / fork
        return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>`;
      case 'operation_change':
        // settings gear
        return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:block"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
      case 'project_start':
        return `<span style="font-weight:800;font-size:12px;line-height:1">S</span>`;
      case 'project_end':
        return `<span style="font-weight:800;font-size:12px;line-height:1">E</span>`;
      default:
        return `<span style="font-size:16px;line-height:1">&#8226;</span>`;
    }
  }

  function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] ?? c
    ));
  }

  function buildPopup(ev: RoadwayLogEventMarker): string {
    const widthStr = ev.roadway_width_ft ? ` &mdash; <strong>${ev.roadway_width_ft} ft</strong>` : '';
    const refTag = ev.is_reference ? '<br><em style="color:#94a3b8;font-size:0.75rem">Reference only</em>' : '';
    const typeLabel = ev.event_type.replace(/_/g, ' ');
    return `<div style="min-width:170px;font-family:system-ui,sans-serif;line-height:1.4">
      <div style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.06em;color:#94a3b8;margin-bottom:3px">${escapeHtml(typeLabel)}</div>
      <strong style="font-size:0.9rem">${escapeHtml(ev.description)}</strong>
      <div style="margin-top:4px;font-size:0.8rem;color:#94a3b8">Mile ${ev.milepost.toFixed(3)}${widthStr}</div>
      ${refTag}
    </div>`;
  }

  // ---- Resolve event coordinate ----
  // Priority: coordinate_geojson stored (from anchoring pass) > interpolate from station
  function resolveCoord(ev: RoadwayLogEventMarker): [number, number] | null {
    if (ev.coordinate_geojson) {
      try {
        const geo = JSON.parse(ev.coordinate_geojson) as { type?: string; coordinates?: [number, number] };
        if (geo.type === 'Point' && Array.isArray(geo.coordinates)) {
          const [lng, lat] = geo.coordinates;
          if (Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
        }
      } catch { /* fall through */ }
    }
    if (waypoints.length >= 2 && ev.station != null) {
      return stationToCoordinate(ev.station, waypoints);
    }
    return null;
  }

  // ---- Width-coded segment polylines ----
  // Build GeoJSON LineString segments where each run of events with the same
  // roadway_width_ft gets a differently colored line.
  interface WidthSegment {
    id: string;
    widthFt: number | null;
    color: string;
    coords: [number, number][]; // [lng, lat] for MapLibre
  }

  function buildWidthSegments(evs: RoadwayLogEventMarker[], wpts: LatLng[]): WidthSegment[] {
    if (wpts.length < 2 || evs.length === 0) return [];

    // Width-coded spans require station positions; events lacking a station
    // (e.g. import-preview events placed by coordinate only) can't be sliced.
    const stationed = evs.filter(
      (e): e is RoadwayLogEventMarker & { station: number } => e.station != null
    );
    if (stationed.length === 0) return [];

    // Sort by station
    const sorted = [...stationed].sort((a, b) => a.station - b.station);

    // Build spans: from event[i].station to event[i+1].station, colored by event[i].width
    const segments: WidthSegment[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      const widthFt = ev.roadway_width_ft;
      const startStation = ev.station;
      const endStation = sorted[i + 1]?.station ?? null;
      if (endStation == null) break; // no more spans after last event

      const startCoord = resolveCoordForStation(startStation, wpts);
      const endCoord = resolveCoordForStation(endStation, wpts);
      if (!startCoord || !endCoord) continue;

      // Slice intermediate waypoints that fall between the two stations
      const slicedCoords = sliceByStation(startStation, endStation, wpts);

      segments.push({
        id: `rwl-seg-${i}`,
        widthFt,
        color: widthColor(widthFt),
        coords: slicedCoords,
      });
    }
    return segments;
  }

  function resolveCoordForStation(station: number, wpts: LatLng[]): [number, number] | null {
    return stationToCoordinate(station, wpts);
  }

  // Walk waypoints and collect intermediate [lng,lat] coords between two stations
  function sliceByStation(startStation: number, endStation: number, wpts: LatLng[]): [number, number][] {
    const startLatLng = stationToCoordinate(startStation, wpts);
    const endLatLng = stationToCoordinate(endStation, wpts);
    if (!startLatLng || !endLatLng) return [];
    // MapLibre wants [lng, lat]
    return [[startLatLng[1], startLatLng[0]], [endLatLng[1], endLatLng[0]]];
  }

  // ---- MapLibre layer management ----
  const { getMap } = getMapContext();
  let addedMap: MapLibreMap | null = null;
  let addedMarkers: { marker: import('maplibre-gl').Marker; id: string }[] = [];
  let addedLayerIds: string[] = [];
  let addedSourceIds: string[] = [];

  function removeAllLayers() {
    const map = addedMap;
    if (!map) return;
    for (const lyr of addedLayerIds) {
      try { if (map.getLayer(lyr)) map.removeLayer(lyr); } catch { /* noop */ }
    }
    for (const src of addedSourceIds) {
      try { if (map.getSource(src)) map.removeSource(src); } catch { /* noop */ }
    }
    for (const { marker } of addedMarkers) {
      try { marker.remove(); } catch { /* noop */ }
    }
    addedLayerIds = [];
    addedSourceIds = [];
    addedMarkers = [];
    addedMap = null;
  }

  async function addAllLayers(map: MapLibreMap) {
    if (!browser) return;
    const { Marker, Popup } = await import('maplibre-gl');

    // 1. Width-coded segments
    const segments = buildWidthSegments(events, waypoints);
    for (const seg of segments) {
      if (seg.coords.length < 2) continue;
      const srcId = `rwl-src-${seg.id}`;
      const lyrId = `rwl-lyr-${seg.id}`;
      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: seg.coords },
            properties: {},
          },
        });
        addedSourceIds.push(srcId);
      }
      if (!map.getLayer(lyrId)) {
        map.addLayer({
          id: lyrId,
          type: 'line',
          source: srcId,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': seg.color,
            'line-width': 5,
            'line-opacity': 0.82,
          },
        });
        addedLayerIds.push(lyrId);
      }
    }

    // 2. Event markers
    for (const ev of events) {
      const coord = resolveCoord(ev);
      if (!coord) continue;
      const [lat, lng] = coord;

      const el = document.createElement('div');
      el.className = 'rwl-marker-pin';
      el.style.setProperty('--pin-color', eventColor(ev.event_type));
      el.innerHTML = markerSvgIcon(ev.event_type);
      el.style.cursor = 'pointer';
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', `${ev.event_type.replace(/_/g, ' ')} at mile ${ev.milepost.toFixed(3)}`);

      const popup = new Popup({ closeButton: true, maxWidth: '240px', className: 'rwl-popup' })
        .setHTML(buildPopup(ev));

      const marker = new Marker({ element: el, anchor: 'center' })
        .setLngLat([lng, lat])
        .setPopup(popup)
        .addTo(map);

      addedMarkers.push({ marker, id: ev.id });
    }

    addedMap = map;
  }

  $effect(() => {
    // Reactive deps
    const _events = events;
    const _waypoints = waypoints;
    const _visible = visible;

    if (!browser) return;
    const map = getMap();
    if (!map) return;

    // Remove existing on every change (simpler than incremental update for now)
    removeAllLayers();

    if (!_visible || _events.length === 0) return;

    const tryAdd = () => {
      if (map.isStyleLoaded()) {
        void addAllLayers(map);
      } else {
        map.once('styledata', () => { void addAllLayers(map); });
      }
    };
    tryAdd();

    return () => {
      removeAllLayers();
    };
  });

  onDestroy(() => {
    removeAllLayers();
  });

  // ---- Legend data (derived) ----
  // Unique widths among events that have a width, for rendering the legend
  const legendWidths = $derived.by(() => {
    if (!visible) return [];
    const seen = new Set<number | null>();
    const out: { widthFt: number | null; color: string }[] = [];
    for (const ev of events) {
      const w = ev.roadway_width_ft;
      if (!seen.has(w)) {
        seen.add(w);
        out.push({ widthFt: w, color: widthColor(w) });
      }
    }
    return out.filter((x) => x.widthFt != null).sort((a, b) => (a.widthFt ?? 0) - (b.widthFt ?? 0));
  });
</script>

{#if visible && legendWidths.length > 1}
  <div class="rwl-legend" aria-label="Roadway width legend">
    <span class="rwl-legend-title">Width</span>
    {#each legendWidths as entry (entry.widthFt)}
      <span class="rwl-legend-item">
        <span class="rwl-legend-swatch" style="background:{entry.color}"></span>
        <span>{entry.widthFt} ft</span>
      </span>
    {/each}
  </div>
{/if}

<style>
  :global(.rwl-marker-pin) {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--pin-color, #94a3b8);
    border: 2px solid rgba(255, 255, 255, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #111827;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
    transition: transform 0.15s, box-shadow 0.15s;
  }

  :global(.rwl-marker-pin:hover) {
    transform: scale(1.18);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.55);
  }

  :global(.rwl-popup .maplibregl-popup-content) {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 8px);
    padding: 10px 12px;
    box-shadow: var(--shadow-md, 0 4px 16px rgba(0,0,0,0.5));
  }

  :global(.rwl-popup.maplibregl-popup-anchor-bottom .maplibregl-popup-tip),
  :global(.rwl-popup.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip),
  :global(.rwl-popup.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip) {
    border-top-color: var(--surface);
  }
  :global(.rwl-popup.maplibregl-popup-anchor-top .maplibregl-popup-tip),
  :global(.rwl-popup.maplibregl-popup-anchor-top-left .maplibregl-popup-tip),
  :global(.rwl-popup.maplibregl-popup-anchor-top-right .maplibregl-popup-tip) {
    border-bottom-color: var(--surface);
  }

  .rwl-legend {
    position: absolute;
    bottom: 12px;
    right: 12px;
    z-index: 500;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    pointer-events: none;
    flex-wrap: wrap;
    max-width: 220px;
  }

  .rwl-legend-title {
    font-size: 0.68rem;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
  }

  .rwl-legend-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: #e2e8f0;
    white-space: nowrap;
  }

  .rwl-legend-swatch {
    display: inline-block;
    width: 14px;
    height: 4px;
    border-radius: 2px;
    flex-shrink: 0;
  }
</style>

<script lang="ts">
  /**
   * MapPolygon — draws a filled area on the MapLibre map (work zones, project areas).
   *
   * Must be rendered inside a <MapView> tree.
   * Adds a GeoJSON source + fill layer (+ optional outline layer) on mount.
   *
   * Usage:
   *   <MapPolygon
   *     id="work-zone-1"
   *     coordinates={[[lat1,lng1],[lat2,lng2],[lat3,lng3],[lat1,lng1]]}
   *     fillColor="#f2c037"
   *     fillOpacity={0.3}
   *   />
   */
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getMapContext, STATUS_COLORS, type RoadStatus } from './mapContext.js';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  interface Props {
    /**
     * Unique id for the source/layer pair. Provide an explicit stable id in lists.
     */
    id?: string;
    /**
     * Outer ring vertices as [latitude, longitude] pairs.
     * The ring does NOT need to be closed — the component closes it automatically.
     */
    coordinates: [number, number][];
    /** Status drives fill colour — see STATUS_COLORS */
    status?: RoadStatus;
    /** Override fill colour (takes precedence over status). Alias: `color`. */
    fillColor?: string;
    /** Alias for `fillColor` — sets both fill and (unless overridden) outline colour. */
    color?: string;
    /** Fill opacity 0–1 */
    fillOpacity?: number;
    /** Outline opacity 0–1 */
    opacity?: number;
    /** Outline colour. Defaults to fill colour at full opacity. Alias: `strokeColor`. */
    outlineColor?: string;
    /** Alias for `outlineColor`. */
    strokeColor?: string;
    /** Outline width in pixels */
    strokeWidth?: number;
    /** Whether to render an outline layer */
    showOutline?: boolean;
    /** Called when the polygon is clicked */
    onclick?: (e: unknown) => void;
  }

  let {
    id = `polygon-${Math.random().toString(36).slice(2, 9)}`,
    coordinates,
    status = 'planned',
    fillColor,
    color,
    fillOpacity = 0.3,
    opacity = 0.8,
    outlineColor,
    strokeColor,
    strokeWidth = 2,
    showOutline = true,
    onclick,
  }: Props = $props();

  const resolvedFill = $derived(fillColor ?? color);
  const resolvedOutline = $derived(outlineColor ?? strokeColor);

  const { getMap } = getMapContext();

  // ids are intentionally captured once — `id` must be stable across re-renders.
  // svelte-ignore state_referenced_locally
  let sourceId = `src-${id}`;
  // svelte-ignore state_referenced_locally
  let fillLayerId = `lyr-fill-${id}`;
  // svelte-ignore state_referenced_locally
  let outlineLayerId = `lyr-outline-${id}`;
  let addedToMap: MapLibreMap | null = null;
  let onEnter: (() => void) | null = null;
  let onLeave: (() => void) | null = null;

  function resolveColor(): string {
    return resolvedFill ?? STATUS_COLORS[status] ?? STATUS_COLORS.planned;
  }

  function toGeoJSON(coords: [number, number][]) {
    // Ensure ring is closed
    const ring = [...coords.map(([lat, lng]): [number, number] => [lng, lat])];
    if (
      ring.length > 0 &&
      (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1])
    ) {
      ring.push(ring[0]);
    }
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'Polygon' as const,
        coordinates: [ring],
      },
      properties: {},
    };
  }

  function addLayers(map: MapLibreMap) {
    if (map.getSource(sourceId)) return;

    const col = resolveColor();

    map.addSource(sourceId, {
      type: 'geojson',
      data: toGeoJSON(coordinates),
    });

    map.addLayer({
      id: fillLayerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': col,
        'fill-opacity': fillOpacity,
      },
    });

    if (showOutline) {
      map.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: sourceId,
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': resolvedOutline ?? col,
          'line-width': strokeWidth,
          'line-opacity': opacity,
        },
      });
    }

    if (onclick) {
      onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
      onLeave = () => { map.getCanvas().style.cursor = ''; };
      map.on('click', fillLayerId, onclick as never);
      map.on('mouseenter', fillLayerId, onEnter);
      map.on('mouseleave', fillLayerId, onLeave);
    }

    addedToMap = map;
  }

  function removeLayers() {
    const map = addedToMap;
    if (!map) return;
    try {
      if (onclick) map.off('click', fillLayerId, onclick as never);
      if (onEnter) map.off('mouseenter', fillLayerId, onEnter);
      if (onLeave) map.off('mouseleave', fillLayerId, onLeave);
      if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {
      // Map may already be destroyed
    }
    onEnter = null;
    onLeave = null;
    addedToMap = null;
  }

  $effect(() => {
    const _coords = coordinates;
    const _fillColor = resolvedFill;
    const _status = status;
    const _fillOpacity = fillOpacity;
    const _outlineColor = resolvedOutline;

    if (!browser) return;
    const map = getMap();
    if (!map) return;

    if (!addedToMap) {
      if (map.isStyleLoaded()) {
        addLayers(map);
      } else {
        map.once('styledata', () => addLayers(map));
      }
    } else {
      const col = _fillColor ?? STATUS_COLORS[_status] ?? STATUS_COLORS.planned;
      const src = map.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined;
      if (src) src.setData(toGeoJSON(_coords));
      if (map.getLayer(fillLayerId)) {
        map.setPaintProperty(fillLayerId, 'fill-color', col);
        map.setPaintProperty(fillLayerId, 'fill-opacity', _fillOpacity);
      }
      if (showOutline && map.getLayer(outlineLayerId)) {
        map.setPaintProperty(outlineLayerId, 'line-color', _outlineColor ?? col);
      }
    }

    return () => {
      removeLayers();
    };
  });

  onDestroy(() => {
    removeLayers();
  });
</script>

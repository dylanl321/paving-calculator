<script lang="ts">
  /**
   * MapPolyline — draws a coloured line on the MapLibre map (roads, routes).
   *
   * Must be rendered inside a <MapView> tree.
   * Adds a GeoJSON source + line layer on mount, removes on destroy.
   *
   * Usage:
   *   <MapPolyline
   *     id="road-segment-1"
   *     coordinates={[[lat1, lng1], [lat2, lng2]]}
   *     color="#f2c037"
   *     width={4}
   *   />
   */
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getMapContext, STATUS_COLORS, type RoadStatus } from './mapContext.js';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  interface Props {
    /**
     * Unique id for the source/layer. Must be stable across re-renders.
     * Defaults to a generated id — provide an explicit one in lists.
     */
    id?: string;
    /** Array of [latitude, longitude] coordinate pairs */
    coordinates: [number, number][];
    /** Status drives line colour — see STATUS_COLORS */
    status?: RoadStatus;
    /** Override colour (takes precedence over status) */
    color?: string;
    /** Line width in pixels */
    width?: number;
    /** Line opacity 0–1 */
    opacity?: number;
    /** Called when the line is clicked */
    onclick?: (e: unknown) => void;
  }

  let {
    id = `polyline-${Math.random().toString(36).slice(2, 9)}`,
    coordinates,
    status = 'planned',
    color,
    width = 4,
    opacity = 1,
    onclick,
  }: Props = $props();

  const { getMap } = getMapContext();

  let sourceId = `src-${id}`;
  let layerId = `lyr-${id}`;
  let addedToMap: MapLibreMap | null = null;
  let onEnter: (() => void) | null = null;
  let onLeave: (() => void) | null = null;

  function resolveColor(): string {
    return color ?? STATUS_COLORS[status] ?? STATUS_COLORS.planned;
  }

  function toGeoJSON(coords: [number, number][]) {
    return {
      type: 'Feature' as const,
      geometry: {
        type: 'LineString' as const,
        // GeoJSON uses [lng, lat]
        coordinates: coords.map(([lat, lng]) => [lng, lat]),
      },
      properties: {},
    };
  }

  function addLayers(map: MapLibreMap) {
    if (map.getSource(sourceId)) return; // Already added

    map.addSource(sourceId, {
      type: 'geojson',
      data: toGeoJSON(coordinates),
    });

    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
      },
      paint: {
        'line-color': resolveColor(),
        'line-width': width,
        'line-opacity': opacity,
      },
    });

    if (onclick) {
      onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
      onLeave = () => { map.getCanvas().style.cursor = ''; };
      map.on('click', layerId, onclick as never);
      map.on('mouseenter', layerId, onEnter);
      map.on('mouseleave', layerId, onLeave);
    }

    addedToMap = map;
  }

  function removeLayers() {
    const map = addedToMap;
    if (!map) return;
    try {
      if (onclick) map.off('click', layerId, onclick as never);
      if (onEnter) map.off('mouseenter', layerId, onEnter);
      if (onLeave) map.off('mouseleave', layerId, onLeave);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {
      // Map may already be destroyed
    }
    onEnter = null;
    onLeave = null;
    addedToMap = null;
  }

  $effect(() => {
    // Track reactive deps
    const _coords = coordinates;
    const _color = color;
    const _status = status;
    const _width = width;
    const _opacity = opacity;

    if (!browser) return;

    const map = getMap();
    if (!map) return;

    if (!addedToMap) {
      const tryAdd = () => {
        if (map.isStyleLoaded()) {
          addLayers(map);
        } else {
          map.once('styledata', () => addLayers(map));
        }
      };
      tryAdd();
    } else {
      // Update source data and paint properties
      const src = map.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined;
      if (src) src.setData(toGeoJSON(_coords));
      if (map.getLayer(layerId)) {
        map.setPaintProperty(layerId, 'line-color', _color ?? STATUS_COLORS[_status] ?? STATUS_COLORS.planned);
        map.setPaintProperty(layerId, 'line-width', _width);
        map.setPaintProperty(layerId, 'line-opacity', _opacity);
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

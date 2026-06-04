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
    /** Override fill colour (takes precedence over status) */
    fillColor?: string;
    /** Fill opacity 0–1 */
    fillOpacity?: number;
    /** Outline colour. Defaults to fill colour at full opacity. */
    outlineColor?: string;
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
    fillOpacity = 0.3,
    outlineColor,
    showOutline = true,
    onclick,
  }: Props = $props();

  const { getMap } = getMapContext();

  let sourceId = `src-${id}`;
  let fillLayerId = `lyr-fill-${id}`;
  let outlineLayerId = `lyr-outline-${id}`;
  let addedToMap: MapLibreMap | null = null;

  function resolveColor(): string {
    return fillColor ?? STATUS_COLORS[status] ?? STATUS_COLORS.planned;
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
          'line-color': outlineColor ?? col,
          'line-width': 2,
          'line-opacity': 0.8,
        },
      });
    }

    if (onclick) {
      map.on('click', fillLayerId, onclick as never);
      map.on('mouseenter', fillLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', fillLayerId, () => { map.getCanvas().style.cursor = ''; });
    }

    addedToMap = map;
  }

  function removeLayers() {
    const map = addedToMap;
    if (!map) return;
    try {
      if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
      if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {
      // Map may already be destroyed
    }
    addedToMap = null;
  }

  $effect(() => {
    const _coords = coordinates;
    const _fillColor = fillColor;
    const _status = status;
    const _fillOpacity = fillOpacity;
    const _outlineColor = outlineColor;

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

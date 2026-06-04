<script lang="ts">
  /**
   * MapGeoJSON — renders arbitrary GeoJSON on the MapLibre map with an optional
   * style function for per-feature styling (colour, width, opacity).
   *
   * Must be rendered inside a <MapView> tree.
   *
   * Usage:
   *   <MapGeoJSON
   *     id="road-network"
   *     {geojson}
   *     styleFunction={(feature) => ({ color: feature.properties?.color ?? '#f2c037', width: 3 })}
   *   />
   */
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getMapContext } from './mapContext.js';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  type GeoJSONData =
    | GeoJSON.Feature
    | GeoJSON.FeatureCollection
    | GeoJSON.Geometry;

  interface LayerStyle {
    /** CSS/hex colour string */
    color?: string;
    /** Line/stroke width in pixels */
    width?: number;
    /** Opacity 0–1 */
    opacity?: number;
    /** Fill opacity for polygons 0–1 */
    fillOpacity?: number;
  }

  interface Props {
    /**
     * Stable unique id for the source/layers.
     */
    id?: string;
    /** GeoJSON object to render */
    geojson: GeoJSONData;
    /**
     * Called once per rendered style pass to determine default layer appearance.
     * Return a LayerStyle object. Per-feature expressions are applied on top.
     */
    styleFunction?: (feature: GeoJSON.Feature | null) => LayerStyle;
    /** Called when a feature is clicked */
    onclick?: (e: unknown) => void;
    /** Layer type to render. Auto-detected from first geometry if omitted. */
    layerType?: 'line' | 'fill' | 'circle' | 'symbol';
  }

  let {
    id = `geojson-${Math.random().toString(36).slice(2, 9)}`,
    geojson,
    styleFunction,
    onclick,
    layerType,
  }: Props = $props();

  const { getMap } = getMapContext();

  let sourceId = `src-${id}`;
  let layerId = `lyr-${id}`;
  let outlineLayerId = `lyr-outline-${id}`;
  let addedToMap: MapLibreMap | null = null;

  function defaultStyle(): LayerStyle {
    return styleFunction ? styleFunction(null) : {
      color: '#f2c037',
      width: 3,
      opacity: 1,
      fillOpacity: 0.3,
    };
  }

  function detectLayerType(data: GeoJSONData): 'line' | 'fill' | 'circle' {
    if (layerType) return layerType as 'line' | 'fill' | 'circle';
    const geomType =
      'type' in data && data.type === 'Feature'
        ? (data as GeoJSON.Feature).geometry?.type
        : 'type' in data && data.type === 'FeatureCollection'
          ? (data as GeoJSON.FeatureCollection).features?.[0]?.geometry?.type
          : (data as GeoJSON.Geometry).type;

    if (geomType === 'Polygon' || geomType === 'MultiPolygon') return 'fill';
    if (geomType === 'Point' || geomType === 'MultiPoint') return 'circle';
    return 'line';
  }

  function addLayers(map: MapLibreMap) {
    if (map.getSource(sourceId)) return;

    const style = defaultStyle();
    const type = detectLayerType(geojson);
    const col = style.color ?? '#f2c037';

    map.addSource(sourceId, {
      type: 'geojson',
      data: geojson as never,
    });

    if (type === 'line') {
      map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': col,
          'line-width': style.width ?? 3,
          'line-opacity': style.opacity ?? 1,
        },
      });
    } else if (type === 'fill') {
      map.addLayer({
        id: layerId,
        type: 'fill',
        source: sourceId,
        paint: {
          'fill-color': col,
          'fill-opacity': style.fillOpacity ?? 0.3,
        },
      });
      map.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': col,
          'line-width': style.width ?? 2,
          'line-opacity': style.opacity ?? 0.8,
        },
      });
    } else if (type === 'circle') {
      map.addLayer({
        id: layerId,
        type: 'circle',
        source: sourceId,
        paint: {
          'circle-color': col,
          'circle-radius': style.width ?? 6,
          'circle-opacity': style.opacity ?? 1,
          'circle-stroke-color': 'rgba(0,0,0,0.4)',
          'circle-stroke-width': 1,
        },
      });
    }

    if (onclick) {
      map.on('click', layerId, onclick as never);
      map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
    }

    addedToMap = map;
  }

  function removeLayers() {
    const map = addedToMap;
    if (!map) return;
    try {
      if (map.getLayer(outlineLayerId)) map.removeLayer(outlineLayerId);
      if (map.getLayer(layerId)) map.removeLayer(layerId);
      if (map.getSource(sourceId)) map.removeSource(sourceId);
    } catch {
      // Map may already be destroyed
    }
    addedToMap = null;
  }

  $effect(() => {
    const _geojson = geojson;
    const _styleFunction = styleFunction;

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
      // Update source data
      const src = map.getSource(sourceId) as import('maplibre-gl').GeoJSONSource | undefined;
      if (src) src.setData(_geojson as never);

      // Update style
      if (_styleFunction) {
        const style = _styleFunction(null);
        const col = style.color ?? '#f2c037';
        if (map.getLayer(layerId)) {
          const lyrType = map.getLayer(layerId)?.type;
          if (lyrType === 'line') {
            map.setPaintProperty(layerId, 'line-color', col);
            if (style.width !== undefined) map.setPaintProperty(layerId, 'line-width', style.width);
            if (style.opacity !== undefined) map.setPaintProperty(layerId, 'line-opacity', style.opacity);
          } else if (lyrType === 'fill') {
            map.setPaintProperty(layerId, 'fill-color', col);
            if (style.fillOpacity !== undefined) map.setPaintProperty(layerId, 'fill-opacity', style.fillOpacity);
          } else if (lyrType === 'circle') {
            map.setPaintProperty(layerId, 'circle-color', col);
          }
          if (map.getLayer(outlineLayerId)) {
            map.setPaintProperty(outlineLayerId, 'line-color', col);
          }
        }
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

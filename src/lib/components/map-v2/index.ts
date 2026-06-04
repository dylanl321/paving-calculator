/**
 * map-v2 — MapLibre GL JS based map components for PaveRate.
 *
 * Tile source: OpenFreeMap (https://tiles.openfreemap.org/) — no API key required.
 *
 * Quick start:
 *   import { MapView, MapMarker, MapPolyline } from '$lib/components/map-v2';
 *
 *   <MapView center={[33.749, -84.388]} zoom={13}>
 *     {#snippet layers()}
 *       <MapMarker lat={33.749} lng={-84.388} status="active" label="A" />
 *       <MapPolyline id="road-1" coordinates={coords} status="today" />
 *     {/snippet}
 *   </MapView>
 */

export { default as MapView }              from './MapView.svelte';
export { default as MapMarker }            from './MapMarker.svelte';
export { default as MapPolyline }          from './MapPolyline.svelte';
export { default as MapPolygon }           from './MapPolygon.svelte';
export { default as MapGeoJSON }           from './MapGeoJSON.svelte';
export { default as MapPopup }          from './MapPopup.svelte';
export { default as PlanSheetOverlay }  from './PlanSheetOverlay.svelte';
export { default as RoadProgressLayer }    from './RoadProgressLayer.svelte';
export { default as TodayProgressOverlay } from './TodayProgressOverlay.svelte';

export {
  getMapContext,
  setMapContext,
  STATUS_COLORS,
  TILE_STYLES,
} from './mapContext.js';
export type { MapContext, RoadStatus } from './mapContext.js';

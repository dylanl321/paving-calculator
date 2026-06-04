/**
 * map-v2 — MapLibre GL JS based map components for PaveRate.
 *
 * Tile source: OpenFreeMap (https://tiles.openfreemap.org/) — no API key required.
 *
 * Quick start:
 *   import { MapView } from '$lib/components/map-v2';
 *
 *   <MapView center={[33.749, -84.388]} zoom={13} height="400px" />
 */

export { default as MapView } from './MapView.svelte';
export { getMapContext, setMapContext, STATUS_COLORS, TILE_STYLES } from './mapContext.js';
export type { MapContext, RoadStatus } from './mapContext.js';

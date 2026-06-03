import type L from 'leaflet';

export const MAP_CONTEXT_KEY = 'leafletMap';

/**
 * Reactive holder shared via Svelte context so child map components
 * (markers, polylines, etc.) can react when the Leaflet map becomes available.
 *
 * Child components mount before the parent's onMount runs, so the map instance
 * may not exist yet at child-mount time. Children should read `ctx.map` inside
 * an `$effect` rather than `onMount` to pick it up once it is assigned.
 */
export interface MapContext {
	map: L.Map | null;
}

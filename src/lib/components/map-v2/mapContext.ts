/**
 * Svelte context key and helpers for map-v2 MapView.
 * Child layer components call getMapContext() to access the live Map instance.
 *
 * Tile source: OpenFreeMap (https://tiles.openfreemap.org/) — no API key required.
 */

import { getContext, setContext } from 'svelte';
import type { Map as MapLibreMap } from 'maplibre-gl';

const MAP_CONTEXT_KEY = Symbol('maplibre-map');

export interface MapContext {
  /** The live MapLibre Map instance. Null before the map is fully initialised. */
  getMap: () => MapLibreMap | null;
}

export function setMapContext(ctx: MapContext): void {
  setContext(MAP_CONTEXT_KEY, ctx);
}

export function getMapContext(): MapContext {
  const ctx = getContext<MapContext | undefined>(MAP_CONTEXT_KEY);
  if (!ctx) {
    throw new Error(
      'getMapContext() called outside a <MapView> tree. ' +
        'Make sure your layer component is a descendant of <MapView>.'
    );
  }
  return ctx;
}

/** Road-segment status → display colour. Matches the design doc. */
export const STATUS_COLORS = {
  planned: '#94a3b8',
  today:   '#f2c037',
  active:  '#f59e0b',
  done:    '#22c55e',
  behind:  '#ef4444',
  skipped: '#475569',
} as const;

export type RoadStatus = keyof typeof STATUS_COLORS;

/**
 * OpenFreeMap style URLs — free, no API key, OpenMapTiles schema.
 * Fallback: MapTiler free tier (requires MAPTILER_KEY env var).
 */
export const TILE_STYLES = {
  dark:  'https://tiles.openfreemap.org/styles/dark',
  light: 'https://tiles.openfreemap.org/styles/bright',
} as const;

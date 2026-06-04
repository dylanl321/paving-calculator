<script lang="ts">
  /**
   * RoadProgressLayer — renders road sections as color-coded polylines on a MapLibre map.
   *
   * Each section's paving status drives the line color:
   *   planned           → gray
   *   scheduled_today   → yellow
   *   in_progress       → orange
   *   completed         → green
   *   behind_schedule   → red
   *   skipped           → dark gray
   *
   * Line thickness is proportional to lane width (base 4 px at 12 ft).
   * Tap/click a segment to see a detail popup.
   *
   * Must be rendered inside a <MapView> tree.
   */
  import { onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { getMapContext, STATUS_COLORS, type RoadStatus } from './mapContext.js';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  export type PavingStatus =
    | 'planned'
    | 'scheduled_today'
    | 'in_progress'
    | 'completed'
    | 'behind_schedule'
    | 'skipped';

  export interface RoadSection {
    id: string;
    name: string;
    lane?: string | null;
    station_start?: number | null;
    station_end?: number | null;
    /** DB status — mapped to PavingStatus internally if paving_status absent */
    status?: 'active' | 'completed' | 'skipped' | string;
    /** Explicit override; takes precedence over status mapping */
    paving_status?: PavingStatus | null;
    geometry_geojson?: string | null;
    /** Lane width in feet — drives line thickness */
    lane_width_ft?: number | null;
    /** Crew name shown in the detail popup */
    crew_name?: string | null;
    notes?: string | null;
  }

  interface Props {
    sections: RoadSection[];
    /** Default lane width (ft) used when section.lane_width_ft is absent */
    defaultLaneWidthFt?: number;
    /** Called when a segment is tapped/clicked */
    onSectionClick?: (section: RoadSection) => void;
  }

  let {
    sections,
    defaultLaneWidthFt = 12,
    onSectionClick,
  }: Props = $props();

  // ---- color map ----
  // Descriptive PavingStatus (used by the DB/UI) maps onto the canonical
  // RoadStatus colour vocabulary in mapContext, so colours live in one place.
  const PAVING_TO_ROAD: Record<PavingStatus, RoadStatus> = {
    planned:         'planned',
    scheduled_today: 'today',
    in_progress:     'active',
    completed:       'done',
    behind_schedule: 'behind',
    skipped:         'skipped',
  };

  function dbStatusToPaving(s: string | undefined | null): PavingStatus {
    switch (s) {
      case 'completed': return 'completed';
      case 'active':    return 'in_progress';
      case 'skipped':   return 'skipped';
      default:          return 'planned';
    }
  }

  function resolveStatus(sec: RoadSection): PavingStatus {
    if (sec.paving_status) return sec.paving_status;
    return dbStatusToPaving(sec.status);
  }

  function resolveColor(sec: RoadSection): string {
    return STATUS_COLORS[PAVING_TO_ROAD[resolveStatus(sec)]];
  }

  /** Line width in pixels proportional to lane width (base 4 px at 12 ft) */
  function resolveWidth(sec: RoadSection): number {
    const lw = sec.lane_width_ft ?? defaultLaneWidthFt;
    return Math.max(2, Math.round((lw / 12) * 4));
  }

  function parseGeometry(sec: RoadSection): [number, number][] | null {
    if (!sec.geometry_geojson) return null;
    try {
      const g = JSON.parse(sec.geometry_geojson) as {
        type: string;
        coordinates: number[][];
      };
      if (g.type !== 'LineString' || !Array.isArray(g.coordinates)) return null;
      // GeoJSON is [lng, lat]; MapLibre addSource also uses [lng, lat]
      return g.coordinates as [number, number][];
    } catch {
      return null;
    }
  }

  // ---- MapLibre layer management ----
  const { getMap } = getMapContext();
  let addedMap: MapLibreMap | null = null;
  let addedIds: string[] = [];
  // Click/hover handlers keyed by layer id so they can be detached on cleanup.
  const handlers = new Map<string, { click: () => void; enter: () => void; leave: () => void }>();

  /** Stable layer/source id for a section, keyed by its id (not array index). */
  function ids(sec: RoadSection) {
    const safe = String(sec.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      src: `rpl-src-${safe}`,
      lyr: `rpl-lyr-${safe}`,
    };
  }

  function addAllLayers(map: MapLibreMap) {
    sections.forEach((sec) => {
      const coords = parseGeometry(sec);
      if (!coords) return;
      const { src, lyr } = ids(sec);

      if (!map.getSource(src)) {
        map.addSource(src, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { id: sec.id },
          },
        });
      }

      if (!map.getLayer(lyr)) {
        map.addLayer({
          id: lyr,
          type: 'line',
          source: src,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': resolveColor(sec),
            'line-width': resolveWidth(sec),
            'line-opacity': 0.9,
          },
        });

        const click = () => { onSectionClick?.(sec); };
        const enter = () => { map.getCanvas().style.cursor = 'pointer'; };
        const leave = () => { map.getCanvas().style.cursor = ''; };
        map.on('click', lyr, click);
        map.on('mouseenter', lyr, enter);
        map.on('mouseleave', lyr, leave);
        handlers.set(lyr, { click, enter, leave });

        addedIds.push(lyr, src);
      }
    });
    addedMap = map;
  }

  function removeAllLayers() {
    const map = addedMap;
    if (!map) return;
    // Detach handlers + remove layers first, then sources.
    addedIds
      .filter((id) => id.startsWith('rpl-lyr-'))
      .forEach((lyr) => {
        try {
          const h = handlers.get(lyr);
          if (h) {
            map.off('click', lyr, h.click);
            map.off('mouseenter', lyr, h.enter);
            map.off('mouseleave', lyr, h.leave);
          }
          if (map.getLayer(lyr)) map.removeLayer(lyr);
        } catch { /* noop */ }
      });
    addedIds
      .filter((id) => id.startsWith('rpl-src-'))
      .forEach((src) => { try { if (map.getSource(src)) map.removeSource(src); } catch { /* noop */ } });
    handlers.clear();
    addedIds = [];
    addedMap = null;
  }

  function updateLayers(map: MapLibreMap) {
    sections.forEach((sec) => {
      const coords = parseGeometry(sec);
      const { src, lyr } = ids(sec);
      if (!coords) return;
      const source = map.getSource(src) as import('maplibre-gl').GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { id: sec.id },
        });
      }
      if (map.getLayer(lyr)) {
        map.setPaintProperty(lyr, 'line-color', resolveColor(sec));
        map.setPaintProperty(lyr, 'line-width', resolveWidth(sec));
      }
    });
  }

  $effect(() => {
    const _secs = sections; // reactive dep

    if (!browser) return;
    const map = getMap();
    if (!map) return;

    if (!addedMap) {
      const tryAdd = () => {
        if (map.isStyleLoaded()) {
          addAllLayers(map);
        } else {
          map.once('styledata', () => addAllLayers(map));
        }
      };
      tryAdd();
    } else {
      updateLayers(addedMap);
    }

    return () => {
      removeAllLayers();
    };
  });

  onDestroy(() => {
    removeAllLayers();
  });
</script>

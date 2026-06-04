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
  import { getMapContext } from './mapContext.js';
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
  const STATUS_COLORS: Record<PavingStatus, string> = {
    planned:          '#94a3b8', // gray
    scheduled_today:  '#f2c037', // yellow
    in_progress:      '#f59e0b', // orange
    completed:        '#22c55e', // green
    behind_schedule:  '#ef4444', // red
    skipped:          '#475569', // dark gray
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
    return STATUS_COLORS[resolveStatus(sec)];
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

  /** Stable layer/source id for a section index */
  function ids(idx: number) {
    return {
      src: `rpl-src-${idx}`,
      lyr: `rpl-lyr-${idx}`,
    };
  }

  function addAllLayers(map: MapLibreMap) {
    sections.forEach((sec, idx) => {
      const coords = parseGeometry(sec);
      if (!coords) return;
      const { src, lyr } = ids(idx);

      if (!map.getSource(src)) {
        map.addSource(src, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { id: sec.id, idx },
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

        map.on('click', lyr, () => {
          onSectionClick?.(sec);
        });
        map.on('mouseenter', lyr, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', lyr, () => { map.getCanvas().style.cursor = ''; });

        addedIds.push(lyr, src);
      }
    });
    addedMap = map;
  }

  function removeAllLayers() {
    const map = addedMap;
    if (!map) return;
    // Remove layers first, then sources
    addedIds
      .filter((id) => id.startsWith('rpl-lyr-'))
      .forEach((lyr) => { try { if (map.getLayer(lyr)) map.removeLayer(lyr); } catch { /* noop */ } });
    addedIds
      .filter((id) => id.startsWith('rpl-src-'))
      .forEach((src) => { try { if (map.getSource(src)) map.removeSource(src); } catch { /* noop */ } });
    addedIds = [];
    addedMap = null;
  }

  function updateLayers(map: MapLibreMap) {
    sections.forEach((sec, idx) => {
      const coords = parseGeometry(sec);
      const { src, lyr } = ids(idx);
      if (!coords) return;
      const source = map.getSource(src) as import('maplibre-gl').GeoJSONSource | undefined;
      if (source) {
        source.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
          properties: { id: sec.id, idx },
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

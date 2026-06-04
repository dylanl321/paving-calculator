<script lang="ts">
  /**
   * PlanSheetOverlay — Georeferenced PDF plan sheet overlay on MapLibre map.
   * Displays a raster image with adjustable opacity and visibility.
   */
  import { getMapContext } from './mapContext';
  import { onMount, onDestroy } from 'svelte';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  interface Props {
    imageUrl: string;
    bounds: {
      ne: { lat: number; lng: number };
      sw: { lat: number; lng: number };
    };
    title?: string;
    visible?: boolean;
    opacity?: number;
  }

  let {
    imageUrl,
    bounds,
    title,
    visible = $bindable(true),
    opacity = $bindable(0.7)
  }: Props = $props();

  const mapContext = getMapContext();
  let sourceId = $state('');
  let layerId = $state('');
  let map = $state<MapLibreMap | null>(null);
  let mounted = $state(false);

  // Generate unique IDs once on mount
  onMount(() => {
    const uniqueId = Math.random().toString(36).slice(2);
    sourceId = `plan-sheet-source-${uniqueId}`;
    layerId = `plan-sheet-layer-${uniqueId}`;
    map = mapContext.getMap();
    mounted = true;
  });

  // Add source and layer when ready
  $effect(() => {
    if (!mounted || !map || !imageUrl || !bounds || !sourceId || !layerId) return;

    // Coordinates in MapLibre format: [NW, NE, SE, SW]
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [bounds.sw.lng, bounds.ne.lat], // NW
      [bounds.ne.lng, bounds.ne.lat], // NE
      [bounds.ne.lng, bounds.sw.lat], // SE
      [bounds.sw.lng, bounds.sw.lat]  // SW
    ];

    // Add source
    map.addSource(sourceId, {
      type: 'image',
      url: imageUrl,
      coordinates
    });

    // Add layer
    map.addLayer({
      id: layerId,
      type: 'raster',
      source: sourceId,
      paint: {
        'raster-opacity': opacity
      },
      layout: {
        visibility: visible ? 'visible' : 'none'
      }
    });

    return () => {
      // Cleanup on effect re-run or destroy
      if (map && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    };
  });

  // Reactive opacity updates
  $effect(() => {
    if (map && layerId && map.getLayer(layerId)) {
      map.setPaintProperty(layerId, 'raster-opacity', opacity);
    }
  });

  // Reactive visibility updates
  $effect(() => {
    if (map && layerId && map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  });

  onDestroy(() => {
    if (map) {
      if (layerId && map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (sourceId && map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    }
  });
</script>

<!-- Control panel -->
<div class="plan-sheet-controls bg-gray-800 border border-gray-700 rounded-lg p-3 shadow-lg">
  {#if title}
    <h3 class="text-sm font-semibold text-white mb-2">{title}</h3>
  {/if}

  <div class="space-y-3">
    <!-- Visibility toggle -->
    <button
      type="button"
      onclick={() => (visible = !visible)}
      class="w-full min-h-[48px] px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
    >
      {visible ? 'Hide Overlay' : 'Show Overlay'}
    </button>

    <!-- Opacity slider -->
    <label class="block">
      <span class="text-sm text-gray-300 mb-1 block">
        Opacity: {Math.round(opacity * 100)}%
      </span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        bind:value={opacity}
        class="w-full h-12 cursor-pointer accent-blue-500"
      />
    </label>
  </div>
</div>

<style>
  .plan-sheet-controls {
    position: absolute;
    top: 10px;
    right: 10px;
    max-width: 240px;
    z-index: 10;
  }

  /* Ensure slider has adequate touch target */
  input[type="range"] {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
  }

  input[type="range"]::-webkit-slider-track {
    height: 6px;
    background: #4b5563;
    border-radius: 3px;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    margin-top: -9px;
  }

  input[type="range"]::-moz-range-track {
    height: 6px;
    background: #4b5563;
    border-radius: 3px;
  }

  input[type="range"]::-moz-range-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: none;
  }
</style>

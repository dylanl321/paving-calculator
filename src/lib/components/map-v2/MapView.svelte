<script lang="ts">
  /**
   * MapView — SSR-safe MapLibre GL JS wrapper for PaveRate.
   *
   * Tile source: OpenFreeMap (https://tiles.openfreemap.org/) — no API key required.
   * Dark/light style is chosen from the `mapStyle` prop or auto-detected from
   * the `data-theme` attribute on <html> (dark is the app default).
   *
   * Usage:
   *   <MapView center={[33.749, -84.388]} zoom={13}>
   *     {#snippet layers()}<RoadLayer {geojson} />{/snippet}
   *   </MapView>
   *
   * Bind the map instance:
   *   <MapView bind:map />
   */
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { setMapContext, TILE_STYLES } from './mapContext.js';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  interface Props {
    /** [latitude, longitude] centre of the viewport */
    center?: [number, number];
    zoom?: number;
    /** Fit to bounds instead of center+zoom: [[swLat,swLng],[neLat,neLng]] */
    bounds?: [[number, number], [number, number]] | null;
    /** CSS height of the map container */
    height?: string;
    /**
     * MapLibre style URL or 'dark' | 'light'.
     * Defaults to auto-detect from <html data-theme>.
     */
    mapStyle?: 'dark' | 'light' | string;
    /** Called once the map is fully loaded and ready */
    onready?: (map: MapLibreMap) => void;
    /**
     * Wheel/trackpad zoom behavior:
     * - 'cooperative': page scroll passes through; Ctrl/Cmd+wheel zooms the map.
     * - true: wheel zooms immediately on hover.
     * - false: wheel zoom is disabled.
     */
    scrollZoom?: boolean | 'cooperative';
    /** Show built-in zoom buttons. */
    navigationControl?: boolean;
    /** Two-way bindable map instance */
    map?: MapLibreMap | null;
    /** Slot for child layer components */
    layers?: import('svelte').Snippet;
  }

  let {
    center = [33.749, -84.388],
    zoom = 13,
    bounds = null,
    height = '100%',
    mapStyle,
    onready,
    scrollZoom = 'cooperative',
    navigationControl = true,
    map = $bindable(null),
    layers,
  }: Props = $props();

  let container: HTMLDivElement;
  let mapInstance: MapLibreMap | null = $state(null);
  let ready = $state(false);

  /** Resolve the MapLibre style URL */
  function resolveStyle(styleProp: string | undefined): string {
    if (styleProp === 'dark') return TILE_STYLES.dark;
    if (styleProp === 'light') return TILE_STYLES.light;
    if (styleProp) return styleProp;
    // Auto-detect from <html data-theme>
    if (browser) {
      const theme = document.documentElement.getAttribute('data-theme');
      return theme === 'light' ? TILE_STYLES.light : TILE_STYLES.dark;
    }
    return TILE_STYLES.dark;
  }

  // Provide the map instance via Svelte context so child layers can access it.
  setMapContext({
    getMap: () => mapInstance,
  });

  onMount(() => {
    if (!browser) return;

    let m: MapLibreMap | null = null;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      await import('maplibre-gl/dist/maplibre-gl.css');

      // Guard: container may have been destroyed while we were importing
      if (!container) return;

      const initOptions: ConstructorParameters<typeof maplibregl.Map>[0] = {
        container,
        style: resolveStyle(mapStyle),
        zoom,
        scrollZoom: scrollZoom !== false,
        cooperativeGestures: scrollZoom === 'cooperative',
        attributionControl: {
          customAttribution: '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a>',
        },
      };

      if (bounds) {
        const [sw, ne] = bounds;
        initOptions.bounds = [
          [sw[1], sw[0]], // [lng, lat]
          [ne[1], ne[0]],
        ];
        initOptions.fitBoundsOptions = { padding: 40 };
      } else {
        initOptions.center = [center[1], center[0]]; // MapLibre uses [lng, lat]
      }

      m = new maplibregl.Map(initOptions);
      if (navigationControl) {
        m.addControl(
          new maplibregl.NavigationControl({ showCompass: false, visualizePitch: false }),
          'bottom-right'
        );
      }

      m.on('load', () => {
        mapInstance = m;
        map = m;
        ready = true;
        onready?.(m!);
      });
    })();

    // Synchronous cleanup — runs before the async body if component is destroyed early
    return () => {
      if (m) {
        m.remove();
      }
      mapInstance = null;
      map = null;
      ready = false;
    };
  });

  onDestroy(() => {
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
      map = null;
    }
  });
</script>

<div
  bind:this={container}
  class="map-view-container"
  style:height
  aria-label="Map"
  role="application"
>
  {#if !ready}
    <div class="map-loading" aria-live="polite">
      <span class="map-loading-spinner" aria-hidden="true"></span>
      <span class="sr-only">Loading map…</span>
    </div>
  {:else if layers}
    {@render layers()}
  {/if}
</div>

<style>
  .map-view-container {
    position: relative;
    width: 100%;
    min-height: 200px;
    background: #1a1a1a;
    border-radius: var(--radius-md, 8px);
    overflow: hidden;
  }

  /* MapLibre canvas fills the container */
  :global(.map-view-container .maplibregl-canvas) {
    border-radius: inherit;
  }

  .map-loading {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #1e1e1e;
    z-index: 1;
  }

  .map-loading-spinner {
    display: block;
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.15);
    border-top-color: var(--color-brand, #f2c037);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>

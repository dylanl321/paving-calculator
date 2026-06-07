<script lang="ts">
  /**
   * MapView — SSR-safe MapLibre GL JS wrapper for PaveRate.
   *
   * Tile source: OpenFreeMap (https://tiles.openfreemap.org/) — no API key required.
   * The basemap style follows the app theme: it is chosen from the `mapStyle`
   * prop when given, otherwise derived reactively from `themeStore.mode`
   * (dark / light / sunlight) so toggling the theme restyles the live map.
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
  import { themeStore } from '$lib/stores/theme.svelte';
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
     * When omitted, the style follows the app theme (`themeStore.mode`) and
     * updates live when the user toggles dark / light / sunlight.
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

  /**
   * The MapLibre style URL the map should currently be showing.
   *
   * - Explicit `mapStyle` prop wins (URL passthrough, or 'dark'/'light' keyword).
   * - Otherwise it is derived reactively from the app theme (`themeStore.mode`),
   *   so toggling dark/light/sunlight after the map has loaded restyles it.
   */
  const resolvedStyleUrl = $derived.by(() => {
    if (mapStyle === 'dark') return TILE_STYLES.dark;
    if (mapStyle === 'light') return TILE_STYLES.light;
    if (mapStyle) return mapStyle;
    // Auto-detect from the reactive theme store (three modes).
    return TILE_STYLES[themeStore.mode] ?? TILE_STYLES.dark;
  });

  // Provide the map instance via Svelte context so child layers can access it.
  setMapContext({
    getMap: () => mapInstance,
  });

  // Track which style URL is currently applied to the live map so the restyle
  // effect below is a no-op when the resolved style hasn't actually changed.
  let appliedStyleUrl: string | null = null;

  // React to theme changes: when the resolved style URL changes after the map
  // exists, swap the basemap. MapLibre's setStyle wipes all custom sources and
  // layers, so the child layer components are re-mounted via the {#key} block
  // below (keyed on resolvedStyleUrl) — their $effect cleanup drops the now
  // orphaned layer refs and re-adds onto the freshly loaded style.
  $effect(() => {
    const url = resolvedStyleUrl;
    if (!browser) return;
    const map = mapInstance;
    if (!map) return;
    if (url === appliedStyleUrl) return;
    appliedStyleUrl = url;
    map.setStyle(url);
  });

  onMount(() => {
    if (!browser) return;

    let m: MapLibreMap | null = null;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      await import('maplibre-gl/dist/maplibre-gl.css');

      // Guard: container may have been destroyed while we were importing
      if (!container) return;

      const initialStyle = resolvedStyleUrl;
      appliedStyleUrl = initialStyle;

      const initOptions: ConstructorParameters<typeof maplibregl.Map>[0] = {
        container,
        style: initialStyle,
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

      // Some OpenFreeMap styles (e.g. `bright`) reference sprite images such as
      // `wood-pattern` that the renderer can't always resolve, logging a noisy
      // "Image could not be loaded" warning on every tile. Supply a 1×1
      // transparent placeholder for any missing image so the warning is silenced
      // without altering the basemap. Registered once; survives setStyle swaps.
      m.on('styleimagemissing', (e) => {
        const id = e.id;
        if (!m || m.hasImage(id)) return;
        m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      });

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
    <!--
      Keyed on the active style URL so a theme-driven setStyle (which wipes all
      custom sources/layers) unmounts and re-mounts every child layer component.
      Their $effect cleanup drops the orphaned layer refs and re-adds onto the
      newly loaded style — otherwise routes/segments/roadway-log overlays would
      vanish after a theme toggle. HTML markers are DOM, not style layers, so
      they would survive regardless, but re-mounting keeps the tree consistent.
    -->
    {#key resolvedStyleUrl}
      {@render layers()}
    {/key}
  {/if}
</div>

<style>
  .map-view-container {
    position: relative;
    width: 100%;
    min-height: 200px;
    background: var(--surface, #1a1a1a);
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
    background: var(--surface-alt, #1e1e1e);
    z-index: 1;
  }

  .map-loading-spinner {
    display: block;
    width: 32px;
    height: 32px;
    border: 3px solid var(--border, rgba(255, 255, 255, 0.15));
    border-top-color: var(--accent, #f2c037);
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

  /* ---------------------------------------------------------------------------
   * Brand popup chrome — applies app-wide to EVERY MapLibre popup rendered
   * inside any <MapView> (markers, MapPopup, roadway-log, job map, etc.).
   * Themed via the global CSS vars set on <html> by the root layout, so popups
   * follow dark / light / sunlight automatically. Callers only supply the body
   * HTML; the container/tip/close-button styling lives here once.
   * ------------------------------------------------------------------------- */
  :global(.maplibregl-popup-content) {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    font-size: var(--fs-md, 0.9375rem);
    line-height: 1.5;
    box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.3));
  }

  /* Popup tip inherits the surface colour for each anchor direction. */
  :global(.maplibregl-popup-anchor-top .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-top-left .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-top-right .maplibregl-popup-tip) {
    border-bottom-color: var(--surface);
  }
  :global(.maplibregl-popup-anchor-bottom .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip),
  :global(.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip) {
    border-top-color: var(--surface);
  }
  :global(.maplibregl-popup-anchor-left .maplibregl-popup-tip) {
    border-right-color: var(--surface);
  }
  :global(.maplibregl-popup-anchor-right .maplibregl-popup-tip) {
    border-left-color: var(--surface);
  }

  :global(.maplibregl-popup-close-button) {
    width: var(--touch, 48px);
    height: var(--touch, 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    top: 2px;
    right: 2px;
    font-size: 20px;
    line-height: 1;
    color: var(--text-muted);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm, 8px);
    transition: color var(--dur, 0.16s) var(--ease), background var(--dur, 0.16s) var(--ease);
  }

  :global(.maplibregl-popup-close-button:hover) {
    color: var(--text);
    background: var(--surface-hover);
  }

  :global(.maplibregl-popup-close-button:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  /* Links inside popup bodies pick up the brand accent. */
  :global(.maplibregl-popup-content a) {
    color: var(--accent);
  }
</style>

<script lang="ts">
  /**
   * MapPopup — a standalone rich popup attached to a [lat, lng] position on the map.
   *
   * Must be rendered inside a <MapView> tree.
   * Use this when you need a popup not tied to a marker (e.g. click-to-inspect).
   *
   * Usage:
   *   <MapPopup lat={33.749} lng={-84.388} open={showPopup} onclose={() => showPopup = false}>
   *     {#snippet content()}
   *       <p>Work zone details…</p>
   *     {/snippet}
   *   </MapPopup>
   */
  import { onDestroy, type Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { getMapContext } from './mapContext.js';
  import type { Popup } from 'maplibre-gl';

  interface Props {
    /** Latitude to anchor the popup */
    lat: number;
    /** Longitude to anchor the popup */
    lng: number;
    /** Whether the popup is visible */
    open?: boolean;
    /** HTML string for popup body (alternative to content snippet) */
    html?: string;
    /** Optional title rendered in a styled header */
    title?: string;
    /** Max CSS width of the popup */
    maxWidth?: string;
    /** Called when the popup is closed by the user */
    onclose?: () => void;
    /** Rich popup body content via snippet */
    content?: Snippet;
  }

  let {
    lat,
    lng,
    open = true,
    html,
    title,
    maxWidth = '300px',
    onclose,
    content,
  }: Props = $props();

  const { getMap } = getMapContext();

  let popupInstance: Popup | null = null;
  let contentEl = $state<HTMLDivElement | null>(null);

  function buildHtml(): string {
    if (html) return title ? `<div class="map-popup"><strong>${title}</strong>${html}</div>` : html;
    return title ? `<div class="map-popup"><strong>${title}</strong></div>` : '';
  }

  async function showPopup() {
    if (!browser) return;
    const map = getMap();
    if (!map) return;

    const { Popup: PopupClass } = await import('maplibre-gl');

    if (popupInstance) {
      popupInstance.setLngLat([lng, lat]);
      if (html || title) popupInstance.setHTML(buildHtml());
      return;
    }

    popupInstance = new PopupClass({
      closeButton: true,
      closeOnClick: false,
      maxWidth,
      className: 'map-popup-overlay',
    })
      .setLngLat([lng, lat])
      .addTo(map);

    if (content && contentEl) {
      popupInstance.setDOMContent(contentEl);
    } else {
      popupInstance.setHTML(buildHtml());
    }

    popupInstance.on('close', () => {
      onclose?.();
      popupInstance = null;
    });
  }

  function hidePopup() {
    if (popupInstance) {
      popupInstance.remove();
      popupInstance = null;
    }
  }

  $effect(() => {
    const _open = open;
    const _lat = lat;
    const _lng = lng;

    if (!browser) return;

    if (_open) {
      const map = getMap();
      if (map) {
        showPopup();
      }
    } else {
      hidePopup();
    }

    return () => {
      hidePopup();
    };
  });

  onDestroy(() => {
    hidePopup();
  });
</script>

{#if content}
  <div bind:this={contentEl} class="map-popup-content" style="display:none">
    {@render content()}
  </div>
{/if}

<style>
  .map-popup-content {
    display: none;
  }

  :global(.map-popup-overlay .maplibregl-popup-content) {
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-md, 8px);
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.5;
    box-shadow: var(--shadow-md, 0 4px 16px rgba(0, 0, 0, 0.5));
    min-width: 180px;
  }

  :global(.map-popup-overlay.maplibregl-popup-anchor-bottom .maplibregl-popup-tip),
  :global(.map-popup-overlay.maplibregl-popup-anchor-bottom-left .maplibregl-popup-tip),
  :global(.map-popup-overlay.maplibregl-popup-anchor-bottom-right .maplibregl-popup-tip) {
    border-top-color: var(--surface);
  }
  :global(.map-popup-overlay.maplibregl-popup-anchor-top .maplibregl-popup-tip),
  :global(.map-popup-overlay.maplibregl-popup-anchor-top-left .maplibregl-popup-tip),
  :global(.map-popup-overlay.maplibregl-popup-anchor-top-right .maplibregl-popup-tip) {
    border-bottom-color: var(--surface);
  }

  :global(.map-popup-overlay .maplibregl-popup-close-button) {
    color: var(--text-muted);
    font-size: 16px;
    padding: 4px 8px;
    line-height: 1;
  }

  :global(.map-popup-overlay .maplibregl-popup-close-button:hover) {
    color: var(--text);
    background: var(--surface-hover);
    border-radius: var(--radius-sm, 4px);
  }

  :global(.map-popup strong) {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--accent, #f2c037);
    margin-bottom: 6px;
  }
</style>

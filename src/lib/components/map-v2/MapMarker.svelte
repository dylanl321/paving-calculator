<script lang="ts">
  /**
   * MapMarker — places a pin on the MapLibre map with optional popup and status colour.
   *
   * Must be rendered inside a <MapView> (or any component that calls setMapContext).
   * The marker is added on mount and removed on destroy.
   *
   * Usage:
   *   <MapView center={[33.749, -84.388]}>
   *     {#snippet layers()}
   *       <MapMarker lat={33.749} lng={-84.388} status="active" label="Job A" />
   *     {/snippet}
   *   </MapView>
   */
  import { onDestroy, type Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { getMapContext, STATUS_COLORS, type RoadStatus } from './mapContext.js';
  import type { Marker, Popup } from 'maplibre-gl';

  interface Props {
    /** Latitude of the marker */
    lat: number;
    /** Longitude of the marker */
    lng: number;
    /** Status drives pin colour — see STATUS_COLORS */
    status?: RoadStatus;
    /** Override colour (takes precedence over status) */
    color?: string;
    /** Short label shown inside the pin element */
    label?: string;
    /** HTML string for the popup body. If omitted, no popup is attached. */
    popupHtml?: string;
    /** Called when the marker is clicked */
    onclick?: (e: MouseEvent) => void;
    /** Slot for custom popup content */
    popup?: Snippet;
  }

  let {
    lat,
    lng,
    status = 'planned',
    color,
    label,
    popupHtml,
    onclick,
    popup,
  }: Props = $props();

  const { getMap } = getMapContext();

  let marker: Marker | null = null;
  let popupInstance: Popup | null = null;
  let el: HTMLDivElement | null = null;
  let popupEl: HTMLDivElement | null = null;

  function resolveColor(): string {
    return color ?? STATUS_COLORS[status] ?? STATUS_COLORS.planned;
  }

  async function initMarker() {
    if (!browser) return;
    const map = getMap();
    if (!map) return;

    const { Marker: MapMarkerClass, Popup: PopupClass } = await import('maplibre-gl');

    // Create custom pin element
    el = document.createElement('div');
    el.className = 'map-marker-pin';
    el.style.setProperty('--pin-color', resolveColor());
    if (label) el.textContent = label;
    if (onclick) {
      el.addEventListener('click', onclick);
      el.style.cursor = 'pointer';
    }

    marker = new MapMarkerClass({ element: el, anchor: 'bottom' })
      .setLngLat([lng, lat])
      .addTo(map);

    if (popupHtml) {
      popupInstance = new PopupClass({ closeButton: true, maxWidth: '280px' })
        .setHTML(popupHtml);
      marker.setPopup(popupInstance);
    }
  }

  function destroyMarker() {
    if (popupInstance) {
      popupInstance.remove();
      popupInstance = null;
    }
    if (marker) {
      marker.remove();
      marker = null;
    }
  }

  // React to position and style prop changes
  $effect(() => {
    // Track deps
    const _lat = lat;
    const _lng = lng;
    const _color = color;
    const _status = status;
    const _label = label;
    const _popupHtml = popupHtml;

    if (!browser) return;

    const map = getMap();
    if (!map) {
      // Map not ready yet — will be initialised by the second $effect below
      return;
    }

    if (!marker) {
      initMarker();
    } else {
      // Update in-place
      marker.setLngLat([_lng, _lat]);
      if (el) {
        el.style.setProperty('--pin-color', color ?? STATUS_COLORS[_status] ?? STATUS_COLORS.planned);
        if (_label !== undefined) el.textContent = _label;
      }
      if (_popupHtml && popupInstance) {
        popupInstance.setHTML(_popupHtml);
      }
    }
  });

  // Initial mount
  $effect(() => {
    if (!browser) return;
    const map = getMap();
    if (map && !marker) {
      // Map already ready
      initMarker();
    } else if (!map) {
      // Wait for map to be set in context (poll via requestAnimationFrame pattern)
      let raf: number;
      const tryInit = () => {
        if (marker) return;
        const m = getMap();
        if (m) {
          initMarker();
        } else {
          raf = requestAnimationFrame(tryInit);
        }
      };
      raf = requestAnimationFrame(tryInit);
      return () => cancelAnimationFrame(raf);
    }
  });

  onDestroy(() => {
    destroyMarker();
  });
</script>

{#if popup}
  <div bind:this={popupEl} style="display:none">
    {@render popup()}
  </div>
{/if}

<style>
  :global(.map-marker-pin) {
    width: 28px;
    height: 36px;
    background: var(--pin-color, #94a3b8);
    border-radius: 50% 50% 50% 0;
    transform: rotate(-45deg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    color: #000;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
    border: 2px solid rgba(255, 255, 255, 0.3);
    transition: background 0.2s;
  }

  :global(.map-marker-pin:hover) {
    filter: brightness(1.15);
  }

  :global(.map-marker-pin > *) {
    transform: rotate(45deg);
  }
</style>

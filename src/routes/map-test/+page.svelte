<script lang="ts">
  import { MapView } from '$lib/components/map-v2/index.js';
  import type { Map as MapLibreMap } from 'maplibre-gl';

  let mapInstance: MapLibreMap | null = $state(null);

  function handleReady(m: MapLibreMap) {
    console.log('[map-test] MapLibre ready, version:', m.version ?? 'unknown');
  }
</script>

<svelte:head>
  <title>Map Test — PaveRate</title>
</svelte:head>

<div class="page">
  <h1>MapView Component Test</h1>
  <p>
    Tile source: <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>
    — no API key required.
  </p>

  <div class="map-wrapper">
    <MapView
      center={[33.749, -84.388]}
      zoom={12}
      height="500px"
      bind:map={mapInstance}
      onready={handleReady}
    />
  </div>

  <p class="status">
    Map instance: {mapInstance ? 'loaded' : 'loading…'}
  </p>
</div>

<style>
  .page {
    padding: 1.5rem;
    max-width: 900px;
    margin: 0 auto;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  p {
    margin-bottom: 1rem;
    color: var(--color-text-muted, #9ca3af);
  }

  .map-wrapper {
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .status {
    margin-top: 0.75rem;
    font-family: monospace;
    font-size: 0.875rem;
  }
</style>

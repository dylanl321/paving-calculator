# Map System Refactor Design

> STATUS: COMPLETED / HISTORICAL. This document describes the planned migration from Leaflet to MapLibre GL JS. The migration is now done: the only map layer is `src/lib/components/map-v2/` (`MapView` + composable layer components), `leaflet`/`@types/leaflet` have been removed as dependencies, and no component uses raw `L.map()`. The `src/lib/components/map/` Leaflet directory and the planned `MapContainer`/`map/layers/` structure described below no longer exist. Kept for historical context only — see the "Map Conventions" section of `AGENTS.md` for the current rules.

## Current State Audit

### Components using Leaflet (25 imports across 15 files)

**Standalone map components** (`src/lib/components/map/`):
- `MapContainer.svelte` — core map wrapper, tile switching dark/light, SSR-safe via `onMount` but top-level `import L from 'leaflet'` still present
- `MapMarker.svelte` — single pin marker
- `MapPolyline.svelte` — generic polyline
- `MapPolygon.svelte` — polygon
- `MapCircleMarker.svelte` — circle marker (station dots)
- `MapDrawing.svelte` — freehand draw mode
- `MapStationPicker.svelte` — click-to-place station on route
- `ProgressPolyline.svelte` — colored progress line
- `StationMarkers.svelte` — station label markers
- `CrewLocationMarker.svelte` — crew GPS pin
- `mapContext.ts` — shared Svelte context holding the L.Map instance

**Feature map components** (`src/lib/components/`):
- `OrgMapView.svelte` — org-level multi-site overview, top-level `import L`
- `RoadSectionEditor.svelte` — draw/define road sections per lane, top-level `import L`
- `RouteAlignmentMap.svelte` — drag-waypoint route tool, correct (`import type L`)
- `HaulRouteMap.svelte` — haul route display, top-level `import L`
- `WorkZoneMap.svelte` — work zone boundary, top-level `import L`
- `DailyProgressReplay.svelte` — time-lapse replay, top-level `import L`
- `SpreadRateHeatMap.svelte` — spread-rate color overlay, top-level `import L`
- `JobSiteLocationPicker.svelte` — pin-drop location picker, **correctly lazy** (`await import('leaflet')` inside `onMount`)

### Current Problems

1. **SSR crashes**: `import L from 'leaflet'` at module scope crashes the SSR renderer and Cloudflare Pages Functions, because Leaflet reads `window`/`document` at import time. `JobSiteLocationPicker` is the only component that avoids this. All others suppress it through `if (browser)` guards but still emit the top-level import, which the SSR bundle must parse.
2. **Raster tiles only**: Carto CDN serves PNG raster tiles. Styling road segments (color by status, width by lane count) requires either SVG overlays on top, or switching to a vector renderer.
3. **Duplicated state/logic**: `waypoints`, `sections`, `STATUS_COLORS`, `FT_PER_STATION` constant lookups, and `haversineMeters` helper calls are copy-pasted in at least 6 components.
4. **No road coloring by paving status**: Current status colors are per-site or per-section (a Leaflet Polyline with a fixed color). There is no unified `planned/today/done/behind` color scheme driven by the production status of a road segment.
5. **No PDF plan overlay**: No georeference or transparency mechanism exists to overlay a plan sheet PNG onto the map.
6. **Hardcoded tile URL**: The single source of tile config lives in `MapContainer.svelte` and is not overridable.

---

## Library Choice: MapLibre GL JS

### Decision: Adopt MapLibre GL JS

MapLibre GL JS (v4.x) replaces Leaflet as the rendering engine.

**Rationale:**

| Criterion | Leaflet | MapLibre GL JS | Mapbox GL JS |
|---|---|---|---|
| License | BSD-2 (free) | BSD-2 (free) | Proprietary v2+ |
| Tiles | Raster only | Raster + Vector | Raster + Vector |
| Road styling | CSS paint on SVG overlay | Native paint properties per layer | Same |
| Custom layer shaders | No | Yes (WebGL) | Yes |
| Offline / PMTiles | Plugin only | First-class | No |
| SSR safety | Crashes (reads window) | Same — must lazy-load | Same |
| Bundle size | ~140 KB | ~280 KB | ~280 KB |
| Svelte 5 ecosystem | Leaflet plugins, no official | None official — wrap ourselves | None official |

Leaflet stays simpler, but its raster-only rendering is a hard ceiling for road coloring. We need per-segment color driven by status, which requires either messy DOM overlays or a native layer expression system. MapLibre GL provides `paint` expressions like:

```json
["match", ["get", "status"],
  "planned", "#94a3b8",
  "today",   "#f2c037",
  "done",    "#22c55e",
  "behind",  "#ef4444",
  "#94a3b8"
]
```

This is first-class in MapLibre; it is a hack in Leaflet.

Mapbox GL JS is ruled out: the v2+ license requires a Mapbox token and prohibits use without their servers for tile delivery. MapLibre is the Apache-licensed community fork of the pre-v2 Mapbox GL codebase and is API-compatible.

### Tile Source: OpenFreeMap (recommended) with MapTiler fallback

**OpenFreeMap** (`https://tiles.openfreemap.org/`) is a free, public vector tile service backed by the OpenFreeMap project. It:
- Requires no API key
- Serves OpenMapTiles schema (compatible with MapLibre styles)
- Provides ready-made dark and light styles
- Has no hard rate limits for reasonable usage

Fallback: **MapTiler free tier** (https://api.maptiler.com/) provides 100K tile requests/month free with a key. This is appropriate if OpenFreeMap uptime is unacceptable in production.

For offline or self-hosted use: **PMTiles** format with a self-hosted S3/R2 bucket. Cloudflare R2 is cost-effective; the `pmtiles` JS library is MapLibre-native. This is a future option once the app has an established crew-tablet offline story.

**Selected tile config (initial):**
```ts
export const TILE_SOURCES = {
  dark:  'https://tiles.openfreemap.org/styles/dark',   // style JSON URL
  light: 'https://tiles.openfreemap.org/styles/bright'
};
```

---

## Component Architecture

### Single `MapView` wrapper with composable layers

Replace the current `MapContainer` + 10 child components with a single `MapView` component that accepts typed layer descriptors as props or slots.

```
src/lib/components/map/
  MapView.svelte          ← replaces MapContainer; owns the MapLibre instance
  mapContext.ts           ← updated: holds maplibregl.Map | null
  layers/
    RoadLayer.svelte      ← GeoJSON LineString features, status-colored
    MarkerLayer.svelte    ← point features (crew, stations)
    PolygonLayer.svelte   ← work zone / haul path polygon
    HeatLayer.svelte      ← spread-rate color ramp
    PdfOverlayLayer.svelte← georeferenced image overlay
    ReplayLayer.svelte    ← animated progress replay
  controls/
    DrawControl.svelte    ← waypoint/polygon draw mode
    StationControl.svelte ← station picker
```

**MapView.svelte interface (target):**
```svelte
<MapView
  center={[lat, lng]}
  zoom={14}
  bind:map
  onready={(m) => { ... }}
>
  {#snippet layers()}
    <RoadLayer {geojson} colorBy="status" />
    <MarkerLayer features={crewPins} />
    <PdfOverlayLayer src={planSheet.url} bounds={planSheet.bounds} />
  {/snippet}
</MapView>
```

`MapView` is always lazy-loaded via `await import('maplibre-gl')` inside `onMount` — identical pattern to `JobSiteLocationPicker`. The `{#snippet layers()}` children render only after the map is ready; they read the map instance from Svelte context.

### SSR Safety

MapLibre GL (like Leaflet) touches `window`/`document` at import time. The fix is identical to the existing `JobSiteLocationPicker` pattern:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let mapInstance: import('maplibre-gl').Map | null = $state(null);

  onMount(async () => {
    if (!browser) return;
    const maplibregl = (await import('maplibre-gl')).default;
    await import('maplibre-gl/dist/maplibre-gl.css');
    mapInstance = new maplibregl.Map({ ... });
  });
</script>
```

No top-level `import maplibregl from 'maplibre-gl'` anywhere. TypeScript types use `import type` only at module scope.

---

## Road Visualization: Status Color Scheme

Road segments are stored as GeoJSON LineString features with a `status` property. The MapLibre paint expression maps status to color:

| Status | Color | Hex | Meaning |
|---|---|---|---|
| `planned` | Slate gray | `#94a3b8` | Scheduled but not yet started |
| `today` | Brand yellow | `#f2c037` | On today's work plan |
| `active` | Amber | `#f59e0b` | Actively being paved right now |
| `done` | Green | `#22c55e` | Completed and compacted |
| `behind` | Red | `#ef4444` | Scheduled today but falling behind target |
| `skipped` | Dark slate | `#475569` | Explicitly skipped/deferred |

Paint expression for `RoadLayer`:
```json
{
  "line-color": [
    "match", ["get", "status"],
    "planned", "#94a3b8",
    "today",   "#f2c037",
    "active",  "#f59e0b",
    "done",    "#22c55e",
    "behind",  "#ef4444",
    "skipped", "#475569",
    "#94a3b8"
  ],
  "line-width": [
    "interpolate", ["linear"], ["zoom"],
    10, 2,
    16, 6
  ],
  "line-opacity": 0.9
}
```

Lane strips can be offset using MapLibre's `line-offset` paint property so multiple lanes on the same road appear as parallel colored bands rather than overlapping lines.

---

## PDF Plan Overlay

### Goal

Field crews often receive paper plan sheets. Scanned or digital PDFs are already uploaded to R2 via the import pipeline. The overlay feature lets a superintendent georeference the plan sheet PNG onto the live map.

### Implementation Approach

**Phase 1: Manual corner-pin georeferencing**

The user imports a PDF plan sheet through the existing upload flow (already stored in R2 as `imports/<orgId>/<uuid>.pdf`). A server action converts the first page to a PNG thumbnail (using `unpdf` or a Cloudflare Worker with `@cloudflare/workers-types` and an image transform). The PNG URL is passed to `PdfOverlayLayer`.

The user places 2–4 control points by clicking on the map and then clicking the corresponding point on the plan sheet preview. The app solves a projective transform from image pixels → WGS84 coordinates.

MapLibre renders the overlay as a raster source with `type: "image"`:
```ts
map.addSource('plan-sheet', {
  type: 'image',
  url: planPngUrl,
  coordinates: [
    [sw.lng, sw.lat],  // top-left
    [ne.lng, sw.lat],  // top-right
    [ne.lng, ne.lat],  // bottom-right
    [sw.lng, ne.lat]   // bottom-left
  ]
});
map.addLayer({
  id: 'plan-sheet-layer',
  type: 'raster',
  source: 'plan-sheet',
  paint: { 'raster-opacity': 0.7 }
});
```

An opacity slider in the UI lets crews fade between the satellite/vector basemap and the plan sheet.

**Phase 2: Auto-registration via GDOT contract summary (future)**

The GDOT contract PDF parser (`src/lib/server/pdf/parse-gdot.ts`) already extracts route designation and county. A future step could query GDOT's GeoJSON API for the matched road segment and use its bounding box as the initial georeference. This is a quality-of-life shortcut, not the primary mechanism.

### DB schema addition (future migration)

```sql
ALTER TABLE job_site_config ADD COLUMN plan_overlays TEXT;
-- JSON array: [{ id, r2_key, png_url, bounds: [[lng,lat]x4], opacity, label }]
```

---

## Data Flow: GeoJSON from D1 into Map Layers

```
D1 (road_sections table)
  ↓ API: GET /api/job-sites/:siteId/road-sections
  ↓ Returns: { type: "FeatureCollection", features: [...] }
        feature.geometry = LineString (from geometry_geojson col)
        feature.properties = { id, name, lane, status, station_start, station_end }
  ↓ SvelteKit load() fetches on page load + reactive refetch on daily-log updates
  ↓ RoadLayer.svelte receives `geojson` prop
  ↓ MapLibre addSource('road-sections', { type: 'geojson', data: geojson })
  ↓ Paint expression colors lines by feature.properties.status
```

The existing `geometry_geojson` column in `road_sections` already stores GeoJSON strings. The API endpoint serializes them as a FeatureCollection. No new schema changes are needed for basic road coloring.

For real-time updates (e.g., status changes as crew advances), the page can poll `/api/job-sites/:siteId/road-sections` every 30 seconds and call `map.getSource('road-sections').setData(newGeoJson)` — MapLibre re-renders without a full layer teardown.

---

## Migration Path

### Phase 0 — No-op: Fix SSR crashes (immediate, low risk)

Convert top-level `import L from 'leaflet'` in all 8 affected components to dynamic imports inside `onMount`. This is a pure bug fix with no visible behavior change. Affected files:
- `OrgMapView.svelte`
- `RoadSectionEditor.svelte`
- `HaulRouteMap.svelte`
- `WorkZoneMap.svelte`
- `DailyProgressReplay.svelte`
- `SpreadRateHeatMap.svelte`
- `map/MapContainer.svelte`
- `map/MapPolyline.svelte`, `MapMarker.svelte`, etc. (child components — follow MapContainer's pattern)

### Phase 1 — New MapView wrapper (parallel, additive)

Install `maplibre-gl`. Create `src/lib/components/map/MapView.svelte` using MapLibre. Create `RoadLayer.svelte` with status color expression. Create `MarkerLayer.svelte`.

**Do not delete Leaflet yet.** Both can coexist during migration.

### Phase 2 — Migrate feature components one by one

Priority order (highest value, lowest risk first):
1. `RoadSectionEditor.svelte` → gain road coloring by status
2. `OrgMapView.svelte` → gain vector tiles
3. `SpreadRateHeatMap.svelte` → replace with MapLibre heatmap layer
4. `DailyProgressReplay.svelte` → replace with animated GeoJSON
5. `RouteAlignmentMap.svelte` → replace with MapLibre draw
6. `HaulRouteMap.svelte`, `WorkZoneMap.svelte` → straightforward swaps

### Phase 3 — PDF overlay

Add `PdfOverlayLayer.svelte`. Add server action for PDF-to-PNG conversion. Add UI in job-site settings for georeference. Add `plan_overlays` column migration.

### Phase 4 — Remove Leaflet

Once all feature components are migrated: remove `leaflet` from `package.json`, delete `src/lib/components/map/` old components, run build to confirm zero Leaflet references.

---

## Open Questions / Future Decisions

1. **OpenFreeMap availability SLA**: No formal SLA. If uptime is unacceptable, fall back to MapTiler free tier (requires storing an API key in KV/env). Suggest starting with OpenFreeMap and monitoring.
2. **Offline tile caching**: Service worker tile caching (via Workbox `CacheFirst` for tile requests) would let MapLibre work in low-connectivity job sites. Scoped to a follow-up task — the current PWA already has Workbox.
3. **MapLibre vs. Protomaps / PMTiles self-host**: For full offline without any external tile CDN dependency, we could host a GA-region extract of OpenMapTiles on R2 as PMTiles. ~500 MB for Georgia. Worth evaluating once crew-tablet offline use is confirmed as a hard requirement.
4. **Draw tool replacement**: The current `MapDrawing.svelte` uses Leaflet.draw. MapLibre has `@mapbox/mapbox-gl-draw` (Apache-licensed fork available as `@mapbox/maplibre-gl-draw`). This is a direct swap.

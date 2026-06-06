# Multi-Segment Job Persistence — Design

## Purpose

This is the **deferred downstream follow-up** to the in-progress
[LLM-Primary PDF Pipeline](../.cursor/plans/llm-primary_pdf_pipeline_feb02982.plan.md).
That plan makes a stronger Workers AI model structure messy contract/plan text into one strict
`StructuredContract` schema whose `segments[]` array holds **N disconnected road segments**
(the Butler `25169` LMIG case = 7 separate streets across town; the GDOT SR 7 ALT `25186` case
= a mainline + a ramp with a milepost reset). That plan **structures + previews** the segments
on the map but deliberately does **NOT** change how a project is saved.

The reason: the current DB schema and `from-import` assume **one route / one geometry per job
site**. There is nowhere for N disconnected, individually-tagged segments to land. This document
designs the persistence layer so each segment becomes its own first-class, mappable, trackable
work unit carrying its `group` (funding program) and `treatment`.

## Current state (what's there now)

- `road_sections` (migration `0031` + `0069`) already stores per-segment geometry as
  `geometry_geojson` TEXT, stationing (`station_start`/`station_end`), `status`, `sort_order`,
  an optional `production_mix_id`, `layer_label`, and `planned_length_ft`. Shape in
  `DbRoadSection` (`src/lib/server/db-jobsites.ts`).
- `from-import/+server.ts` ALREADY writes multiple `road_sections` rows — but only by
  **slicing one resolved route** into N pieces (`buildRoadSectionsFromRoute`) or by cutting the
  single LRS route between roadway-log change-stations (`buildRoadSectionsFromLogSegments`).
  Both assume a **single continuous LineString**. There is no path that takes N independent,
  separately-resolved segment geometries.
- `road_sections` has **no `group` and no `treatment`** column, so the LMIG-vs-LRA program split
  and the overlay-vs-restripe distinction have nowhere to persist.
- The sections read/write API (`/api/job-sites/[id]/sections`) and `DbRoadSection` already exist
  and are the natural surface to extend (no new table needed).

### Key finding

**We do NOT need a new table.** `road_sections` is already the per-segment, geometry-bearing,
job-site-scoped entity the multi-segment model wants. The gap is (1) two missing columns
(`segment_group`, `treatment`) and a couple of provenance/terminus fields, and (2) a
`from-import` path that ingests N pre-resolved segment geometries instead of slicing one route.

This keeps the codebase unified (no parallel "segments" table duplicating `road_sections`).

## Schema change — migration `0078`

Next sequential head is `0078` (current head is `0077`; historical dupes at `0071`/`0074`
predate the no-dupe rule — do not add to them). SQLite has no `ADD COLUMN IF NOT EXISTS`, so use
bare `ALTER TABLE ... ADD COLUMN` statements, all nullable (purely additive, no existing query
breaks — same backward-compat guarantee as `0042`/`0069`).

```sql
-- Migration 0078: multi-segment road_sections fields.
-- A PDF-imported project can contain N physically disconnected segments (a
-- MultiLineString): e.g. City-of-Butler LMIG = 7 separate streets, or a GDOT
-- project with a mainline + a ramp on its own milepost axis. Each becomes one
-- road_sections row. These columns let a row carry its funding/scope grouping,
-- its treatment, its source termini text, and its measure-axis kind so the N
-- segments persist with full provenance instead of being flattened onto one route.

ALTER TABLE road_sections ADD COLUMN segment_group TEXT;     -- funding/scope program, e.g. 'LMIG','LRA'
ALTER TABLE road_sections ADD COLUMN treatment TEXT;         -- 'overlay'|'resurfacing'|'restripe_only'|'milling'|...
ALTER TABLE road_sections ADD COLUMN measure_axis TEXT;      -- 'project_mile'|'none' (local streets have no M axis)
ALTER TABLE road_sections ADD COLUMN begin_terminus TEXT;    -- source 'from' description (e.g. 'Edgewood Dr')
ALTER TABLE road_sections ADD COLUMN end_terminus TEXT;      -- source 'to' description (e.g. 'end of pavement')
ALTER TABLE road_sections ADD COLUMN geometry_confidence TEXT; -- 'high'|'medium'|'low' for the snapped line
```

Index to support grouping/filtering in the UI (sections grouped by program):

```sql
CREATE INDEX IF NOT EXISTS idx_road_sections_group ON road_sections(job_site_id, segment_group);
```

`DbRoadSection` (`src/lib/server/db-jobsites.ts`) gains the matching optional fields:

```ts
segment_group?: string | null;
treatment?: string | null;
measure_axis?: 'project_mile' | 'none' | null;
begin_terminus?: string | null;
end_terminus?: string | null;
geometry_confidence?: 'high' | 'medium' | 'low' | null;
```

## `from-import` change

### New input shape

The extraction pipeline (the in-progress plan) produces, per segment, a resolved GeoJSON
LineString tagged with name + group + treatment + per-terminus confidence. `from-import` must
accept that directly rather than re-deriving from one route. Add an optional `segments[]` to
`FromImportRequest` (and the `route_override`-style adapter the in-progress plan emits):

```ts
interface ImportSegment {
  name: string;
  kind: 'mainline' | 'ramp' | 'divided' | 'local_street';
  group: string | null;             // 'LMIG' | 'LRA' | ...
  treatment: string | null;         // 'overlay' | 'restripe_only' | ...
  measure_axis: 'project_mile' | 'none';
  begin_terminus: string | null;
  end_terminus: string | null;
  length_mi: number | null;
  geometry: { type: 'LineString'; coordinates: [number, number][] } | null; // [lng,lat]
  geometry_confidence: 'high' | 'medium' | 'low';
  production_mix_id?: string | null;
}

interface FromImportRequest {
  parsed: ParsedGdotJob;
  segments?: ImportSegment[];        // NEW — when present, persist these as road_sections
  // ... existing fields unchanged ...
}
```

### New persistence path (additive — does not replace the existing one)

In `from-import/+server.ts`, branch:

- **`body.segments` present and non-empty** → write one `road_sections` row per segment using
  its own geometry, `segment_group`, `treatment`, `measure_axis`, termini, and
  `geometry_confidence`. Compute `planned_length_ft` from `length_mi` (× `CONST.FT_PER_MILE`) and
  derive `station_start`/`station_end` per segment from its own geometry length (NOT a shared
  axis — local streets each start at station 0). Set `sort_order` to preserve doc order; group
  ordering by `segment_group` so the UI can cluster.
- **`body.segments` absent** → keep the **existing** `buildRoadSectionsFromRoute` /
  `buildRoadSectionsFromLogSegments` behavior verbatim (single-route projects, manual creates,
  and any caller that hasn't adopted segments yet keep working unchanged).

The single-route geographic resolution (job-site lat/lng, county/district lookup, route
waypoints) still runs as today; for the multi-segment case, the job-site pin can be the centroid
of the first segment (or left as resolved by `parsed`), and `upsertJobSiteRoute` is **skipped**
(there is no single route — the segments ARE the geometry). The map renders the N segment
LineStrings as a MultiLineString.

### Geometry confidence / never-fabricate

`geometry_confidence` carries through the roads-only / never-invent rule: a segment whose
terminus could not be geocoded (e.g. "end of pavement", "Beginning of Curve") is stored
`low` with a best-effort snapped line, surfaced in the UI for manual map adjustment — never a
fabricated point. This matches the review-page amber/red convention already used for low-confidence fields.

## Read path / UI (minimal, follow-on)

- `/api/job-sites/[id]/sections` GET already `SELECT *`s, so the new columns flow through with no
  code change. The POST/PUT handlers and `DbRoadSection` gain the optional fields.
- The job-site Location/Sections UI groups `road_sections` by `segment_group` and shows
  `treatment` as a badge. Segments with `geometry_confidence: 'low'` get the existing amber
  "verify on map" affordance. (UI work is a thin follow-on; the data model is the gating piece.)

## Migration / rollout safety

- New columns are nullable, no DEFAULT → existing rows valid, existing INSERT/UPDATE that omit
  them keep working (`0042`/`0069` precedent).
- **Deploy ordering trap (per AGENTS.md):** code that writes the new columns must NOT ship before
  `0078` is applied to the shared remote D1, or `from-import` 500s with "no such column". Mirror
  the existing `upsertJobSiteConfig` core/optional column-split + retry-without-optional guard
  when binding the new columns, OR gate the new INSERT columns behind a try/catch that retries
  without them. Migrations auto-apply on push to `main` via `.github/workflows/deploy.yml`; verify
  with `wrangler d1 migrations list paverate-db --remote` before/after.
- There is ONE shared D1 (`paverate-db`); `dev.paverate.com` and prod share it — no separate dev DB.

## Explicitly out of scope

- The extraction/structuring side (owned by the in-progress LLM-Primary plan).
- Changing how `production_mixes` / `bid_items` map to segments (a segment→mix association beyond
  the existing optional `production_mix_id` is a later refinement).
- Per-segment daily-log / load tracking (segments are mappable + trackable via `status`; deeper
  per-segment production rollups are future work).

## Build / test notes

- Validate with the real Cloudflare build (`npx wrangler types` then `npx vite build`), authoritative per AGENTS.md; `svelte-check` shows pre-existing false errors.
- `from-import` multi-segment persistence is testable against local D1 (`npm run db:local` after
  adding `0078`) without the AI binding — the segment array is plain input.
- Regression: a fixture posting a 7-segment `body.segments` (Butler) asserts 7 `road_sections`
  rows with correct `segment_group` (5 LMIG / 2 LRA) and `treatment`; a 2-segment fixture
  (SR 7 ALT mainline + ramp) asserts 2 rows with independent `station_start`=0 axes.
```

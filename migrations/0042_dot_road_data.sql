-- Migration: 0042_dot_road_data
-- Adds multi-state DOT road segment reference data model.
-- Supports ALDOT (AL), TxDOT (TX), GDOT (GA), FDOT (FL) and any future states.
--
-- Design notes:
--   dot_road_segments  -- external DOT reference data fetched from agency APIs
--   dot_sync_log       -- tracks the last successful sync per (state, source)
--   road_sections gains state_dot + external_segment_id for optional DOT linkage

-- ============================================================
-- 1. DOT road segments table (unified model, one row per segment per DOT)
-- ============================================================
CREATE TABLE IF NOT EXISTS dot_road_segments (
  id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),

  -- Discriminator: 2-letter USPS state abbreviation (AL, TX, GA, FL, ...)
  state_dot           TEXT NOT NULL CHECK(length(state_dot) = 2),

  -- Source agency identifier (aldot, txdot, gdot, fdot, fhwa_hpms)
  source              TEXT NOT NULL,

  -- External identifier as returned by the source API (opaque, agency-specific)
  external_id         TEXT NOT NULL,

  -- Human-readable road name / route label
  road_name           TEXT,

  -- Route identifier (state-specific format, e.g. FDOT "ROADWAY" 8-char CC+RRR+SSS)
  route_id            TEXT,

  -- Functional classification (FHWA f_system values: 1=Interstate, 2=Other Fwy, etc.)
  functional_class    INTEGER,

  -- Pavement surface type (agency-specific code stored as text for portability)
  surface_type        TEXT,

  -- Pavement condition metrics (NULL when not available from public data)
  iri                 REAL,   -- International Roughness Index (in/mi or m/km)
  pci                 REAL,   -- Pavement Condition Index 0-100
  psr                 REAL,   -- Present Serviceability Rating 0-5

  -- Linear referencing: begin/end milepost along the route
  begin_milepost      REAL,
  end_milepost        REAL,

  -- Segment length (miles)
  length_miles        REAL,

  -- Number of travel lanes
  lanes               INTEGER,

  -- Annual Average Daily Traffic
  aadt                INTEGER,

  -- DOT district / management area (agency-specific code)
  district_code       TEXT,

  -- County identifier (FIPS 5-digit or agency-specific)
  county_code         TEXT,

  -- Geometry as GeoJSON LineString (WGS84 / EPSG:4326)
  geometry_geojson    TEXT,

  -- Raw source JSON (full API response object for the segment; for future re-parsing)
  raw_json            TEXT,

  -- Data vintage (epoch seconds of the source dataset, not this row's insert time)
  data_year           INTEGER,

  -- Row timestamps
  fetched_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Unique constraint: one row per (state, source, external_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dot_segments_external
  ON dot_road_segments(state_dot, source, external_id);

-- Query indexes
CREATE INDEX IF NOT EXISTS idx_dot_segments_state
  ON dot_road_segments(state_dot);

CREATE INDEX IF NOT EXISTS idx_dot_segments_route
  ON dot_road_segments(state_dot, route_id);

CREATE INDEX IF NOT EXISTS idx_dot_segments_county
  ON dot_road_segments(state_dot, county_code);

-- ============================================================
-- 2. Sync log: tracks last successful import per (state, source)
-- ============================================================
CREATE TABLE IF NOT EXISTS dot_sync_log (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  state_dot    TEXT NOT NULL CHECK(length(state_dot) = 2),
  source       TEXT NOT NULL,
  status       TEXT NOT NULL CHECK(status IN ('success', 'partial', 'failed')),
  records_upserted INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT,
  synced_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_dot_sync_log_state_source
  ON dot_sync_log(state_dot, source, synced_at DESC);

-- ============================================================
-- 3. Extend road_sections with optional DOT linkage
-- ============================================================
-- state_dot: optional 2-letter state code when this section maps to a DOT segment
ALTER TABLE road_sections ADD COLUMN state_dot TEXT;

-- external_segment_id: FK into dot_road_segments.external_id (soft reference, no FK constraint)
ALTER TABLE road_sections ADD COLUMN external_segment_id TEXT;

-- dot_source: agency that provided the linked segment (aldot, txdot, gdot, fdot, fhwa_hpms)
ALTER TABLE road_sections ADD COLUMN dot_source TEXT;

CREATE INDEX IF NOT EXISTS idx_road_sections_dot
  ON road_sections(state_dot, external_segment_id)
  WHERE state_dot IS NOT NULL;

-- Migration 0074: GDOT active construction projects table
-- Stores active paving/resurfacing projects ingested from GDOT GeoPI ArcGIS

CREATE TABLE IF NOT EXISTS gdot_construction_projects (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  project_number TEXT NOT NULL,
  description TEXT,
  county      TEXT,
  district    TEXT,
  let_date    INTEGER,        -- Unix timestamp (ms from ArcGIS epoch)
  comp_date   INTEGER,        -- Unix timestamp (ms)
  project_type TEXT,          -- raw project type / work type field
  route       TEXT,
  latitude    REAL,
  longitude   REAL,
  geometry_geojson TEXT,      -- GeoJSON Point or LineString if available
  raw_json    TEXT NOT NULL,  -- full raw attributes from ArcGIS
  fetched_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE(project_number)
);

CREATE INDEX IF NOT EXISTS idx_gdot_proj_county ON gdot_construction_projects(county);
CREATE INDEX IF NOT EXISTS idx_gdot_proj_fetched ON gdot_construction_projects(fetched_at);

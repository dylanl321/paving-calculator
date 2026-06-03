-- Migration: 0031_road_sections
-- Add road_sections table for tracking active paving sections on job sites

CREATE TABLE IF NOT EXISTS road_sections (
  id TEXT PRIMARY KEY,
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT '1',
  station_start REAL,
  station_end REAL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'skipped')),
  geometry_geojson TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_road_sections_job_site ON road_sections(job_site_id);
CREATE INDEX IF NOT EXISTS idx_road_sections_status ON road_sections(job_site_id, status);

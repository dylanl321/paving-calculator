-- work_zones.job_site_id was INTEGER, but job_sites.id is TEXT.
-- Running parseInt() on a TEXT id produced NaN, so zones never saved/loaded.
-- Recreate the table with job_site_id TEXT, preserving any existing rows.

PRAGMA foreign_keys=OFF;

CREATE TABLE work_zones_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  zone_type TEXT NOT NULL CHECK(zone_type IN ('paving','milling','tack','base','other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','complete','hold')),
  geometry_geojson TEXT,
  color TEXT,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO work_zones_new (
  id, org_id, job_site_id, name, zone_type, status,
  geometry_geojson, color, notes, created_at, updated_at, created_by
)
SELECT
  id, org_id, CAST(job_site_id AS TEXT), name, zone_type, status,
  geometry_geojson, color, notes, created_at, updated_at, created_by
FROM work_zones;

DROP TABLE work_zones;

ALTER TABLE work_zones_new RENAME TO work_zones;

CREATE INDEX IF NOT EXISTS idx_work_zones_org_job_site ON work_zones(org_id, job_site_id);

PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS work_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  job_site_id INTEGER NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_work_zones_org_job_site ON work_zones(org_id, job_site_id);

CREATE TABLE IF NOT EXISTS crew_locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id TEXT NOT NULL,
  job_site_id INTEGER,
  user_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'crew',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  accuracy REAL,
  heading REAL,
  speed REAL,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_crew_locations_org ON crew_locations(org_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_crew_locations_job_site ON crew_locations(job_site_id, updated_at);

-- Ensure unique location per user per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_locations_user_org ON crew_locations(org_id, user_id);

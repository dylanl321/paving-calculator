-- Plan sheet georeferenced overlay table
CREATE TABLE IF NOT EXISTS plan_sheet_georef (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_site_id TEXT NOT NULL,
  title TEXT NOT NULL,
  pdf_url TEXT NOT NULL,
  thumbnail_url TEXT,
  bounds_ne_lat REAL,
  bounds_ne_lng REAL,
  bounds_sw_lat REAL,
  bounds_sw_lng REAL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_plan_sheet_georef_job_site_id ON plan_sheet_georef(job_site_id);

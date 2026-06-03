-- Migration 0054: Project schematics (plan-sheet images extracted from the
-- contract summary PDF, e.g. typical sections, location sketch, roadway log).
-- Images are rendered client-side and stored in R2; this table holds metadata.

CREATE TABLE IF NOT EXISTS job_schematics (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  page_number INTEGER,
  label TEXT,
  content_type TEXT NOT NULL DEFAULT 'image/png',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_schematics_job_site ON job_schematics(job_site_id);

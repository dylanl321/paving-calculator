-- Migration 0050: Production goals / mixes for a job site.
-- Captures the per-mix production plan from the Job Setup form: bid quantity,
-- takeoff tonnage, daily production rate and estimated days.

CREATE TABLE IF NOT EXISTS job_production_mixes (
  id TEXT PRIMARY KEY,
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  mix_name TEXT NOT NULL,
  unit TEXT,
  bid_quantity REAL,
  takeoff_tonnage REAL,
  quantity_per_day REAL,
  est_days REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_production_mixes_job_site ON job_production_mixes(job_site_id);

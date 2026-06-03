-- Migration: 0016_milestones
-- Adds milestone tracking for project phases

CREATE TABLE IF NOT EXISTS job_site_milestones (
  id TEXT PRIMARY KEY,
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  target_date TEXT,
  completed_at INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_site_milestones_job_site_id
  ON job_site_milestones(job_site_id);

-- Migration: Job Site Route Alignment
-- Description: Stores user-drawn route/alignment polylines for job sites

CREATE TABLE IF NOT EXISTS job_site_routes (
  job_site_id TEXT PRIMARY KEY,
  waypoints TEXT NOT NULL, -- JSON array of {lat: number, lng: number}
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_routes_updated ON job_site_routes(updated_at);

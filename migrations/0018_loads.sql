-- Per-load ticket tracking
CREATE TABLE IF NOT EXISTS loads (
  id TEXT PRIMARY KEY,
  job_site_id TEXT NOT NULL REFERENCES job_sites(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  ticket_number TEXT,
  tons REAL NOT NULL,
  timestamp INTEGER NOT NULL,
  spread_rate REAL,
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_loads_job_site ON loads(job_site_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_loads_user ON loads(user_id, timestamp DESC);

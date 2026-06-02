-- Truck Queue Tracker
-- Manages trucks en-route to job sites with ETA tracking

CREATE TABLE IF NOT EXISTS truck_queue (
  id TEXT PRIMARY KEY,
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  truck_number TEXT NOT NULL,
  estimated_tons REAL,
  departure_time INTEGER NOT NULL,
  travel_time_minutes INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'en_route' CHECK(status IN ('en_route', 'arrived', 'dismissed')),
  arrived_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_truck_queue_job_site ON truck_queue(job_site_id, status, departure_time);
CREATE INDEX IF NOT EXISTS idx_truck_queue_eta ON truck_queue(job_site_id, status, departure_time, travel_time_minutes);

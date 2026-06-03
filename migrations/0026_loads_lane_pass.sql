-- Add lane and pass tracking to loads
ALTER TABLE loads ADD COLUMN lane_number INTEGER;
ALTER TABLE loads ADD COLUMN pass_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_loads_lane ON loads(job_site_id, lane_number, timestamp DESC);

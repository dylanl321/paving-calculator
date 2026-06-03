-- Nuclear gauge density readings
CREATE TABLE IF NOT EXISTS density_readings (
  id TEXT PRIMARY KEY,
  daily_log_id TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
  station_number REAL NOT NULL,        -- e.g. 10+50 stored as 1050 (feet from project start)
  lane TEXT,                           -- 'left', 'right', 'center', or custom
  reading_number INTEGER NOT NULL DEFAULT 1,  -- 1st, 2nd, 3rd reading at this spot
  wet_density_pcf REAL NOT NULL,       -- nuclear gauge wet density reading (pcf)
  moisture_pct REAL NOT NULL,          -- nuclear gauge moisture reading (%)
  dry_density_pcf REAL,                -- calculated: wet_density / (1 + moisture/100)
  target_density_pcf REAL,             -- job target (from proctor test)
  compaction_pct REAL,                 -- calculated: dry_density / target * 100
  depth_in REAL,                       -- lift thickness for this reading
  notes TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_density_readings_log ON density_readings(daily_log_id);

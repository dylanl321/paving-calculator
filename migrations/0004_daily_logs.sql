-- PaveRate D1 Database Schema
-- Migration 0004: Daily logs and production tracking

-- Daily logs table (one per job site per day)
CREATE TABLE daily_logs (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id TEXT NOT NULL,
    log_date TEXT NOT NULL, -- YYYY-MM-DD format
    created_by TEXT NOT NULL,
    weather_temp_f REAL,
    weather_conditions TEXT CHECK(weather_conditions IN ('clear', 'cloudy', 'rain', 'wind', 'fog')),
    wind_speed_mph REAL,
    crew_count INTEGER,
    start_time TEXT, -- HH:MM format
    end_time TEXT,   -- HH:MM format
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(job_site_id, log_date)
);

CREATE INDEX idx_daily_logs_job_site_id ON daily_logs(job_site_id);
CREATE INDEX idx_daily_logs_log_date ON daily_logs(log_date);
CREATE INDEX idx_daily_logs_created_by ON daily_logs(created_by);

-- Log entries table (multiple entries per daily log)
CREATE TABLE log_entries (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    daily_log_id TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK(entry_type IN ('paving', 'milling', 'tack', 'break', 'delay', 'note')),
    timestamp TEXT NOT NULL, -- HH:MM format
    station_start REAL,      -- Station number (e.g., 142.5 = station 142+50)
    station_end REAL,
    distance_ft REAL,        -- Auto-calculated or manually entered
    tons_placed REAL,
    loads_count INTEGER,
    truck_tickets TEXT,      -- JSON array of ticket numbers
    spread_rate_actual REAL, -- lbs/sq yd
    tack_gallons REAL,
    lane TEXT,               -- e.g., "left", "right", "center", "shoulder"
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE CASCADE
);

CREATE INDEX idx_log_entries_daily_log_id ON log_entries(daily_log_id);
CREATE INDEX idx_log_entries_entry_type ON log_entries(entry_type);
CREATE INDEX idx_log_entries_timestamp ON log_entries(timestamp);

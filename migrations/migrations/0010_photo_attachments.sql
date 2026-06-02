-- Migration: Photo Attachments with GPS Coordinates
-- Description: Stores field photos geo-tagged with GPS coordinates for job sites

CREATE TABLE photo_attachments (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id TEXT NOT NULL,
    daily_log_id TEXT,           -- optional: link to a specific log
    log_entry_id TEXT,           -- optional: link to a specific log entry
    r2_key TEXT NOT NULL,        -- R2 object key e.g. "photos/{job_site_id}/{id}.jpg"
    filename TEXT NOT NULL,
    caption TEXT,
    lat REAL,                    -- GPS latitude at time of capture
    lng REAL,                    -- GPS longitude at time of capture
    gps_accuracy_m REAL,         -- accuracy in meters
    taken_at INTEGER NOT NULL,   -- unix timestamp
    uploaded_by TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_photo_attachments_job_site_id ON photo_attachments(job_site_id);
CREATE INDEX idx_photo_attachments_daily_log_id ON photo_attachments(daily_log_id);

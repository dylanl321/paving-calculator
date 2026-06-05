-- Persist imported roadway-log route events from GDOT plan sheets.
CREATE TABLE IF NOT EXISTS roadway_log_events (
    id                  TEXT PRIMARY KEY,
    job_site_id         TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    source_key          TEXT,
    page_number         INTEGER,
    milepost            REAL NOT NULL,
    station             REAL NOT NULL,
    event_type          TEXT NOT NULL CHECK(event_type IN ('project_start','project_end','operation_change','width_change','side_road','reference','note')),
    description         TEXT NOT NULL,
    roadway_width_ft    REAL,
    side                TEXT CHECK(side IN ('left','right')),
    surface             TEXT CHECK(surface IN ('paved','unpaved')),
    is_reference        INTEGER NOT NULL DEFAULT 0,
    confidence          TEXT NOT NULL CHECK(confidence IN ('high','medium','low')),
    raw_text            TEXT,
    coordinate_geojson  TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_roadway_log_events_job_site
    ON roadway_log_events(job_site_id, sort_order, milepost);

CREATE INDEX IF NOT EXISTS idx_roadway_log_events_type
    ON roadway_log_events(job_site_id, event_type);

-- PaveRate D1 Database Schema
-- Migration 0003: Job site configuration and equipment

-- Job site configuration table
CREATE TABLE job_site_config (
    job_site_id TEXT PRIMARY KEY,
    road_type TEXT CHECK(road_type IN ('highway', 'state_route', 'county_road', 'city_street', 'subdivision', 'parking_lot', 'other')),
    num_lanes INTEGER,
    lane_width_ft REAL DEFAULT 12,
    total_length_ft REAL,
    scope_of_work TEXT CHECK(scope_of_work IN ('full_depth', 'mill_and_fill', 'overlay', 'leveling', 'patching', 'widening')),
    mix_type TEXT,
    target_thickness_in REAL,
    target_spread_rate REAL,
    tack_type TEXT CHECK(tack_type IN ('anionic', 'cationic', 'polymer_modified', 'trackless')),
    target_tack_rate REAL,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_config_job_site_id ON job_site_config(job_site_id);

-- Job site equipment table
CREATE TABLE job_site_equipment (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id TEXT NOT NULL,
    equipment_type TEXT NOT NULL CHECK(equipment_type IN ('paver', 'shuttle_buggy', 'roller_breakdown', 'roller_intermediate', 'roller_finish', 'distributor', 'milling_machine', 'other')),
    name TEXT NOT NULL,
    capacity TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_equipment_job_site_id ON job_site_equipment(job_site_id);

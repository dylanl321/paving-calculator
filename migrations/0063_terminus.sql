-- Begin/end terminus for a job site's route.
-- Stations are offsets along the stored route centerline (ft / 100), so a
-- terminus is always road-constrained by construction; the *_terminus text
-- columns hold the human-readable description parsed from the contract headline
-- (e.g. "THE FLORIDA STATE LINE"). SQLite has no ADD COLUMN IF NOT EXISTS, so
-- each column is its own bare statement.
ALTER TABLE job_site_config ADD COLUMN begin_terminus TEXT;
ALTER TABLE job_site_config ADD COLUMN end_terminus TEXT;
ALTER TABLE job_site_config ADD COLUMN begin_station REAL;
ALTER TABLE job_site_config ADD COLUMN end_station REAL;

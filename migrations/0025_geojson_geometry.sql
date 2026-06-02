-- Add geometry column to job_sites for storing route/work zone GeoJSON
ALTER TABLE job_sites ADD COLUMN geometry_geojson TEXT;
ALTER TABLE job_sites ADD COLUMN geometry_updated_at INTEGER;

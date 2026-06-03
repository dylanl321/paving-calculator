-- Add route designation fields to job_site_config
-- Ties job site to GDOT route system (GPAS MapServer Layer 5)
ALTER TABLE job_site_config ADD COLUMN route_designation TEXT;
ALTER TABLE job_site_config ADD COLUMN route_county TEXT;
ALTER TABLE job_site_config ADD COLUMN route_district TEXT;
ALTER TABLE job_site_config ADD COLUMN route_functional_class TEXT;
ALTER TABLE job_site_config ADD COLUMN route_system_code TEXT;

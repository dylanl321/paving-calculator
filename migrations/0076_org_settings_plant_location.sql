-- Add plant (asphalt plant) location fields to org_settings
-- Used for haul distance calculation: straight-line Haversine from plant to job site
ALTER TABLE org_settings ADD COLUMN plant_lat REAL;
ALTER TABLE org_settings ADD COLUMN plant_lng REAL;
ALTER TABLE org_settings ADD COLUMN plant_name TEXT;

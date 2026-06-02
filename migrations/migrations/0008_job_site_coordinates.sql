-- Add latitude and longitude columns to job_sites for map view
ALTER TABLE job_sites ADD COLUMN latitude REAL;
ALTER TABLE job_sites ADD COLUMN longitude REAL;

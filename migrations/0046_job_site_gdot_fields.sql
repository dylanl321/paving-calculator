-- Add GDOT county and district fields to job_sites table
-- Migration 0046

ALTER TABLE job_sites ADD COLUMN gdot_county TEXT;
ALTER TABLE job_sites ADD COLUMN gdot_district TEXT;

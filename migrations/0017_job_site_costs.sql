-- PaveRate D1 Database Schema
-- Add cost tracking fields to job_site_config

ALTER TABLE job_site_config ADD COLUMN cost_per_ton REAL;
ALTER TABLE job_site_config ADD COLUMN cost_per_sy REAL;
ALTER TABLE job_site_config ADD COLUMN cost_per_mile REAL;
ALTER TABLE job_site_config ADD COLUMN total_contract_value REAL;

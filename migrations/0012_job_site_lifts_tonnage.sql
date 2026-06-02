-- PaveRate D1 Database Schema
-- Migration 0012: Add num_lifts and total_tonnage to job_site_config

ALTER TABLE job_site_config ADD COLUMN num_lifts INTEGER;
ALTER TABLE job_site_config ADD COLUMN total_tonnage REAL;

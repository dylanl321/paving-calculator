-- Migration 0053: Full per-mix paving spec on production mixes.
-- A project has multiple mixes, each with its own paving spec (thickness,
-- spread rate, tack) and tonnage. is_active marks the mix currently being
-- placed, which calculators and daily-log targets read.

ALTER TABLE job_production_mixes ADD COLUMN mix_type TEXT;
ALTER TABLE job_production_mixes ADD COLUMN target_thickness_in REAL;
ALTER TABLE job_production_mixes ADD COLUMN target_spread_rate REAL;
ALTER TABLE job_production_mixes ADD COLUMN tack_type TEXT;
ALTER TABLE job_production_mixes ADD COLUMN target_tack_rate REAL;
ALTER TABLE job_production_mixes ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0;

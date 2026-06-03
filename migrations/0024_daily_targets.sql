-- Daily target fields for per-day order targets
ALTER TABLE daily_logs ADD COLUMN target_tons REAL;
ALTER TABLE daily_logs ADD COLUMN target_loads INTEGER;
ALTER TABLE daily_logs ADD COLUMN plant_name TEXT;
ALTER TABLE daily_logs ADD COLUMN mix_type TEXT;

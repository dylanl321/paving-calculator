-- Daily target fields for per-day order targets
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS target_tons REAL;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS target_loads INTEGER;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS plant_name TEXT;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS mix_type TEXT;

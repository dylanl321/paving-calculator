-- End-of-day close-out workflow columns
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS closed_at INTEGER;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS foreman_name TEXT;

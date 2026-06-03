-- End-of-day close-out workflow columns
ALTER TABLE daily_logs ADD COLUMN closed_at INTEGER;
ALTER TABLE daily_logs ADD COLUMN foreman_name TEXT;

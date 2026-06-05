-- Migration 0073: Auto-weather snapshot columns on daily_logs
-- Adds is_raining (boolean) and weather_fetched_at (unix ts) so the server
-- can auto-populate weather on log creation and the UI can tell whether a
-- snapshot is present vs. still pending.
ALTER TABLE daily_logs ADD COLUMN is_raining INTEGER DEFAULT 0;
ALTER TABLE daily_logs ADD COLUMN weather_fetched_at INTEGER;

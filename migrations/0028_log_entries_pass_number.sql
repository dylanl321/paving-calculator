-- Add pass_number to log_entries for multi-pass tracking
ALTER TABLE log_entries ADD COLUMN pass_number INTEGER;

CREATE INDEX IF NOT EXISTS idx_log_entries_lane_pass ON log_entries(daily_log_id, lane, pass_number);

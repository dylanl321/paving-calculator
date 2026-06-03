-- Add report_recipients column to org_settings for email distribution list
-- Note: D1/SQLite does not support IF NOT EXISTS in ALTER TABLE ADD COLUMN
ALTER TABLE org_settings ADD COLUMN report_recipients TEXT;

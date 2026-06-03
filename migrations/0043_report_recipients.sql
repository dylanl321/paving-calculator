-- Add report_recipients column to org_settings for email distribution list
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS report_recipients TEXT;

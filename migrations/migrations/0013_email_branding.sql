-- Add email branding fields to org_settings
ALTER TABLE org_settings ADD COLUMN email_from_name TEXT;
ALTER TABLE org_settings ADD COLUMN email_reply_to TEXT;

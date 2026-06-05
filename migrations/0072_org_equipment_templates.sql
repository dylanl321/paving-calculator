-- Add equipment_templates column to org_settings for storing org-wide equipment templates
ALTER TABLE org_settings ADD COLUMN equipment_templates TEXT;

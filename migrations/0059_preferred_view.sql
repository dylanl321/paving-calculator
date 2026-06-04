-- Add preferred_view column to org_members for storing user view preferences
ALTER TABLE org_members ADD COLUMN preferred_view TEXT;

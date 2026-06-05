-- Add preferred_units column to org_members for storing user unit system preference
ALTER TABLE org_members ADD COLUMN preferred_units TEXT;

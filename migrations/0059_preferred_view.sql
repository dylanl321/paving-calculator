-- Add preferred_view column to org_members for storing user view preferences
-- Allows per-user override of their default view tier (full|field|screed|office)
ALTER TABLE org_members ADD COLUMN preferred_view TEXT;

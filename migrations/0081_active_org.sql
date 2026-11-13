-- Remember which organization a user is working in when they belong to more than one.
-- Nullable. When unset, the app uses the most recently accepted membership.
ALTER TABLE users ADD COLUMN active_org_id TEXT;

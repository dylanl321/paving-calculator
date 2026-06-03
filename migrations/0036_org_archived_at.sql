-- Soft-archive flag for organizations (admin "archive org" action). Additive and
-- nullable so existing rows are unaffected; NULL means active.
-- Isolated from 0035 because SQLite has no ADD COLUMN IF NOT EXISTS; keeping this
-- in its own file ensures the idempotent email_log creation is never blocked by it.
ALTER TABLE organizations ADD COLUMN archived_at INTEGER;

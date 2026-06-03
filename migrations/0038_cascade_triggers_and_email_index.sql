-- Migration 0038: CASCADE constraints (via triggers) and email normalization index
-- D1/SQLite does not support ALTER TABLE ADD CONSTRAINT for foreign keys on existing tables.
-- We implement the intended ON DELETE CASCADE behavior via BEFORE DELETE triggers.
-- The email index enables case-insensitive lookups without collation changes.

-- ============================================================
-- Email normalization index
-- ============================================================
-- Enables fast, case-insensitive email lookups: WHERE LOWER(email) = LOWER(?)
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

-- ============================================================
-- Intended CASCADE relationships (documentation)
-- ============================================================
-- organizations (id) -> org_members (org_id)         ON DELETE CASCADE
-- job_sites (id)     -> daily_logs (job_site_id)     ON DELETE CASCADE
-- daily_logs (id)    -> log_entries (daily_log_id)   ON DELETE CASCADE

-- ============================================================
-- Trigger: organizations -> org_members
-- ============================================================
CREATE TRIGGER IF NOT EXISTS trg_cascade_delete_org_members
  BEFORE DELETE ON organizations
  FOR EACH ROW
BEGIN
  DELETE FROM org_members WHERE org_id = OLD.id;
END;

-- ============================================================
-- Trigger: job_sites -> daily_logs -> log_entries
-- ============================================================
-- Step 1: when a daily_log is about to be deleted, remove its log_entries first
CREATE TRIGGER IF NOT EXISTS trg_cascade_delete_log_entries
  BEFORE DELETE ON daily_logs
  FOR EACH ROW
BEGIN
  DELETE FROM log_entries WHERE daily_log_id = OLD.id;
END;

-- Step 2: when a job_site is deleted, remove its daily_logs
-- (which in turn fires trg_cascade_delete_log_entries for each row)
CREATE TRIGGER IF NOT EXISTS trg_cascade_delete_daily_logs
  BEFORE DELETE ON job_sites
  FOR EACH ROW
BEGIN
  DELETE FROM daily_logs WHERE job_site_id = OLD.id;
END;

-- Migration 0057: Admin audit log for tracking user authentication events
-- Records login, register, password reset, and email verification events with
-- IP address and user agent for security monitoring and compliance.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  org_id TEXT,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_user ON admin_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_org ON admin_audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_type ON admin_audit_log(event_type, created_at DESC);

ALTER TABLE users ADD COLUMN last_login_at INTEGER;
ALTER TABLE users ADD COLUMN last_login_ip TEXT;

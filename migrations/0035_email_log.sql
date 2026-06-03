-- Email send log: one row per send attempt from the email helpers.
-- Feeds the admin email debug viewer and the admin overview "recent failed emails".
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  to_email TEXT NOT NULL,
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  type TEXT NOT NULL,
  org_id TEXT,
  user_id TEXT,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to_email ON email_log(to_email);

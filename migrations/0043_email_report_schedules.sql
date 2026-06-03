-- Migration: 0043_email_report_schedules
-- Adds scheduled email delivery of reports to stakeholders.

CREATE TABLE IF NOT EXISTS email_report_schedules (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK(report_type IN ('daily_summary', 'weekly_rollup', 'monthly_rollup')),
  frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly')),
  send_hour INTEGER NOT NULL DEFAULT 8,      -- 0-23 UTC hour to send
  day_of_week INTEGER,                        -- 0=Sun..6=Sat for weekly
  recipients TEXT NOT NULL DEFAULT '[]',      -- JSON array of email strings
  enabled INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_sent_at INTEGER,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_report_schedules_org ON email_report_schedules(org_id);
CREATE INDEX IF NOT EXISTS idx_email_report_schedules_enabled ON email_report_schedules(enabled, frequency);

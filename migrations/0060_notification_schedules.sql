-- Migration: notification_schedules
-- Configurable notification delivery schedules per org

CREATE TABLE IF NOT EXISTS notification_schedules (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id      TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('eod_summary', 'weekly_report')),
  enabled     INTEGER NOT NULL DEFAULT 1,
  send_time   TEXT NOT NULL DEFAULT '17:00',
  timezone    TEXT NOT NULL DEFAULT 'America/Chicago',
  recipients  TEXT NOT NULL DEFAULT '[]',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (org_id) REFERENCES orgs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_schedules_org_id ON notification_schedules(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_schedules_org_type ON notification_schedules(org_id, schedule_type);

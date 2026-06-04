-- 0064_app_logs.sql
-- Structured request / event log table for the admin observability panel.

CREATE TABLE IF NOT EXISTS app_logs (
  id            TEXT    NOT NULL PRIMARY KEY,
  timestamp     INTEGER NOT NULL,           -- unixepoch (seconds)
  level         TEXT    NOT NULL DEFAULT 'info', -- 'info' | 'warn' | 'error'
  method        TEXT,
  path          TEXT,
  status        INTEGER,
  latency_ms    INTEGER,
  user_id       TEXT,
  org_id        TEXT,
  ip            TEXT,
  user_agent    TEXT,
  cf_ray        TEXT,
  error_message TEXT,
  error_stack   TEXT,
  metadata      TEXT    -- JSON blob for extra structured fields
);

CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp ON app_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_app_logs_level     ON app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_path      ON app_logs (path);
CREATE INDEX IF NOT EXISTS idx_app_logs_user_id   ON app_logs (user_id);

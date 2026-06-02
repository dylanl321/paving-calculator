-- Migration 0013: Per-user notification preferences
CREATE TABLE IF NOT EXISTS user_notification_prefs (
  user_id   TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pref_key  TEXT    NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, pref_key)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user
  ON user_notification_prefs(user_id);

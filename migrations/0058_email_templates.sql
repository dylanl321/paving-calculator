-- Migration: email_templates
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  template_key TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_by TEXT,
  UNIQUE(org_id, template_key)
);
CREATE INDEX IF NOT EXISTS idx_email_templates_org_key ON email_templates(org_id, template_key);

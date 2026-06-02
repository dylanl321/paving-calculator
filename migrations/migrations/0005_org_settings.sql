-- PaveRate D1 Database Schema
-- Migration 0005: Organization settings, branding, and value overrides

-- One row per organization. Stores branding (accent color, custom logo in R2)
-- and a JSON blob of overrides for global defaults/constants/tack rates that
-- otherwise come from src/lib/config/paverate.yaml. Only changed keys are stored.
CREATE TABLE org_settings (
    org_id TEXT PRIMARY KEY,
    accent_color TEXT,
    logo_key TEXT,
    logo_content_type TEXT,
    overrides TEXT,
    updated_by TEXT,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_org_settings_org_id ON org_settings(org_id);

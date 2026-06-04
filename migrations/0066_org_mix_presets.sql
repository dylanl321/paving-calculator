-- 0066_org_mix_presets.sql
-- Org-level reusable mix preset library.
-- Each org defines named mix presets with target spread rates, thickness, tack coat, and plant info.
-- Job-site mixes (job_production_mixes) may reference a preset via preset_id (nullable FK).

CREATE TABLE IF NOT EXISTS org_mix_presets (
  id                   TEXT    NOT NULL PRIMARY KEY,
  org_id               TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,                        -- e.g. "9.5mm Superpave Surface"
  mix_type             TEXT,                                    -- "surface" | "binder" | "base" | "leveling"
  target_thickness_in  REAL,                                    -- inches
  target_spread_rate   REAL,                                    -- lbs/SY
  tack_type            TEXT,
  target_tack_rate     REAL,                                    -- gal/SY
  plant_supplier       TEXT,
  notes                TEXT,
  is_default           INTEGER NOT NULL DEFAULT 0,             -- show first in dropdowns
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_org_mix_presets_org_id ON org_mix_presets (org_id);

-- Migration 0064: Org-level mix preset library.
-- Orgs define reusable mix presets (name, spread rate, thickness, tack, plant).
-- Job-site mixes (job_production_mixes) reference a preset via preset_id (nullable).
-- Global starters are injected at runtime from paverate.yaml; is_global_starter rows
-- are reserved for future DB-seeded starters and must not be mutated by orgs.

CREATE TABLE IF NOT EXISTS org_mix_presets (
  id                   TEXT    NOT NULL PRIMARY KEY,
  org_id               TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  mix_type             TEXT,
  design_spread_rate   REAL,                        -- lbs/SY
  design_thickness_in  REAL,                        -- inches
  tack_type            TEXT,
  tack_rate_gsy        REAL,                        -- gal/SY
  plant_supplier       TEXT,
  notes                TEXT,
  source_preset_id     TEXT    REFERENCES org_mix_presets(id) ON DELETE SET NULL,
  is_global_starter    INTEGER NOT NULL DEFAULT 0,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_by           TEXT    REFERENCES users(id) ON DELETE SET NULL,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_org_mix_presets_org  ON org_mix_presets(org_id);
CREATE INDEX IF NOT EXISTS idx_org_mix_presets_sort ON org_mix_presets(org_id, sort_order);

-- Link existing job-site mixes back to the preset they were created from (nullable).
ALTER TABLE job_production_mixes ADD COLUMN preset_id TEXT
  REFERENCES org_mix_presets(id) ON DELETE SET NULL;

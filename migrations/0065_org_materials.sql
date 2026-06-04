-- Migration 0065: Org-level material library.
-- Orgs can override densities for built-in paverate.yaml materials (builtin_id NOT NULL)
-- or add entirely new material types (builtin_id NULL).
-- The UNIQUE constraint on (org_id, builtin_id) ensures at most one density override
-- per built-in material per org.

CREATE TABLE IF NOT EXISTS org_materials (
  id                    TEXT    NOT NULL PRIMARY KEY,
  org_id                TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  builtin_id            TEXT,                          -- e.g. 'MAT.GAB'; NULL = custom material
  name                  TEXT    NOT NULL,
  category              TEXT    NOT NULL
                        CHECK  (category IN ('aggregate','asphalt','soil','concrete')),
  density_tons_per_yd3  REAL    NOT NULL,
  supplier              TEXT,
  notes                 TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1,    -- 0 = soft-deleted
  created_by            TEXT    REFERENCES users(id)   ON DELETE SET NULL,
  created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (org_id, builtin_id)
);

CREATE INDEX IF NOT EXISTS idx_org_materials_org    ON org_materials(org_id);
CREATE INDEX IF NOT EXISTS idx_org_materials_active ON org_materials(org_id, is_active);

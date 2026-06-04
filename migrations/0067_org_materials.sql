-- 0067_org_materials.sql
-- Org-level custom material library.
-- Orgs can add custom materials or override densities for built-ins from paverate.yaml.
-- base_material_id links back to a built-in material ID (e.g. "MAT.GAB") when overriding;
-- NULL means a fully custom material.

CREATE TABLE IF NOT EXISTS org_materials (
  id                   TEXT    NOT NULL PRIMARY KEY,
  org_id               TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                 TEXT    NOT NULL,
  category             TEXT    NOT NULL
                       CHECK  (category IN ('aggregate', 'asphalt', 'soil', 'concrete', 'other')),
  density_tons_per_yd3 REAL,
  supplier             TEXT,
  notes                TEXT,
  base_material_id     TEXT,                                   -- nullable: built-in ID being overridden
  is_active            INTEGER NOT NULL DEFAULT 1,             -- 0 = soft-deleted
  sort_order           INTEGER NOT NULL DEFAULT 0,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_org_materials_org_id   ON org_materials (org_id);
CREATE INDEX IF NOT EXISTS idx_org_materials_category ON org_materials (org_id, category);

-- Migration 0080: pavement_structure child table.
-- THE SINGLE SOURCE OF TRUTH for per-mile-range typical-section / pavement
-- specs. A road_sections row (one paved segment) can carry MORE than one
-- pavement spec when its typical section changes over its length — the
-- applies_from_mi / applies_to_mi range partitions the segment. The denormalized
-- columns on road_sections (target_thickness_in / target_spread_rate /
-- mill_depth_in / width_ft, migration 0079) are convenience defaults DERIVED
-- from these child rows, never an independent source.
-- All spec values are nullable with no DEFAULT: an absent typical-section value
-- persists as NULL (never invented).

CREATE TABLE IF NOT EXISTS pavement_structure (
  id TEXT PRIMARY KEY,
  road_section_id TEXT NOT NULL REFERENCES road_sections(id) ON DELETE CASCADE,
  applies_from_mi REAL,
  applies_to_mi REAL,
  lift_thickness_in REAL,
  mill_depth_in REAL,
  spread_rate_lbs_sy REAL,
  width_ft_min REAL,
  width_ft_max REAL,
  mix TEXT,
  source_page INTEGER,
  confidence TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pavement_structure_section ON pavement_structure(road_section_id);

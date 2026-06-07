-- Migration 0079: denormalized pavement default columns on road_sections.
-- The child pavement_structure table (migration 0080) is the SINGLE SOURCE OF
-- TRUTH for per-mile-range typical-section specs. These four columns are
-- DENORMALIZED convenience defaults — the section's representative/predominant
-- spec — DERIVED from the child rows for cheap reads, never independently
-- edited. All columns are nullable with no DEFAULT, so existing rows stay valid
-- and existing INSERT/UPDATE queries that omit them keep working.
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, so each is a bare ALTER TABLE.

ALTER TABLE road_sections ADD COLUMN target_thickness_in REAL;

ALTER TABLE road_sections ADD COLUMN target_spread_rate REAL;

ALTER TABLE road_sections ADD COLUMN mill_depth_in REAL;

ALTER TABLE road_sections ADD COLUMN width_ft REAL;

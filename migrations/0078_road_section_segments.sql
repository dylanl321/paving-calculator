-- Migration 0078: multi-segment road_sections fields.
-- A PDF-imported project can contain N physically disconnected segments (a
-- MultiLineString): e.g. a City-of-Butler LMIG project = several separate
-- streets, or a GDOT project with a mainline + a ramp on its own milepost axis.
-- Each becomes one road_sections row. These columns let a row carry its
-- funding/scope grouping, its treatment, its source termini text, its
-- measure-axis kind, and the confidence of its snapped geometry so the N
-- segments persist with full provenance instead of being flattened onto one
-- route. All columns are nullable with no DEFAULT, so existing rows stay valid
-- and existing INSERT/UPDATE queries that omit them keep working.

ALTER TABLE road_sections ADD COLUMN segment_group TEXT;

ALTER TABLE road_sections ADD COLUMN treatment TEXT;

ALTER TABLE road_sections ADD COLUMN measure_axis TEXT;

ALTER TABLE road_sections ADD COLUMN begin_terminus TEXT;

ALTER TABLE road_sections ADD COLUMN end_terminus TEXT;

ALTER TABLE road_sections ADD COLUMN geometry_confidence TEXT;

CREATE INDEX IF NOT EXISTS idx_road_sections_group ON road_sections(job_site_id, segment_group);

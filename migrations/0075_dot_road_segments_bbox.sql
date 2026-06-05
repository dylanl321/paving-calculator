-- Migration: 0075_dot_road_segments_bbox
-- Adds pre-computed bounding-box columns to dot_road_segments so we can do
-- efficient spatial lookups (bbox overlap) without spatial extensions.
-- These are populated by the normaliser/upsert layer when geometry_geojson is present.

ALTER TABLE dot_road_segments ADD COLUMN bbox_min_lng REAL;
ALTER TABLE dot_road_segments ADD COLUMN bbox_min_lat REAL;
ALTER TABLE dot_road_segments ADD COLUMN bbox_max_lng REAL;
ALTER TABLE dot_road_segments ADD COLUMN bbox_max_lat REAL;

-- Composite index for bbox overlap queries:
--   WHERE bbox_min_lng <= :maxLng AND bbox_max_lng >= :minLng
--     AND bbox_min_lat <= :maxLat AND bbox_max_lat >= :minLat
CREATE INDEX IF NOT EXISTS idx_dot_segments_bbox
  ON dot_road_segments(bbox_min_lng, bbox_max_lng, bbox_min_lat, bbox_max_lat)
  WHERE bbox_min_lng IS NOT NULL;

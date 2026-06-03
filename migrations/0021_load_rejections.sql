-- Load rejection tracking
ALTER TABLE loads ADD COLUMN rejected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE loads ADD COLUMN rejection_reason TEXT;
ALTER TABLE loads ADD COLUMN rejection_notes TEXT;

-- Historical rejection tracking table
CREATE TABLE IF NOT EXISTS load_rejections (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id),
  reason TEXT NOT NULL CHECK(reason IN ('temp_too_low', 'temp_too_high', 'wrong_mix', 'contaminated', 'overloaded', 'underweight', 'damaged_in_transit', 'other')),
  notes TEXT,
  rejected_by TEXT NOT NULL REFERENCES users(id),
  rejected_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_load_rejections_load ON load_rejections(load_id);

-- Migration 0049: Contract bid / line items (e.g. GDOT schedule of items).
-- Each row is a pay item parsed from a contract summary: item id, description,
-- quantity, unit, unit price and extended bid amount. Optional grouping by
-- section (Roadway, Alternate A/B, etc.).

CREATE TABLE IF NOT EXISTS job_bid_items (
  id TEXT PRIMARY KEY,
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  line_number TEXT,
  item_id TEXT,
  description TEXT NOT NULL,
  quantity REAL,
  unit TEXT,
  unit_price REAL,
  bid_amount REAL,
  section TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_bid_items_job_site ON job_bid_items(job_site_id);

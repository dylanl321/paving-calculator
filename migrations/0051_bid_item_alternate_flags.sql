-- Migration 0051: Alternate-item support for contract bid items.
-- is_alternate marks items that belong to an alternate section (ALT 1/2/A/B);
-- selected controls whether the item is counted in tonnage/cost rollups
-- (alternates default to unselected).

ALTER TABLE job_bid_items ADD COLUMN is_alternate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_bid_items ADD COLUMN selected INTEGER NOT NULL DEFAULT 1;

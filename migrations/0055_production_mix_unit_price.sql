-- Migration 0055: Contract unit price per mix.
-- The per-ton (or per-unit) contract price from the matching asphalt bid item,
-- so we can show margin = contract unit price - our cost per ton.

ALTER TABLE job_production_mixes ADD COLUMN contract_unit_price REAL;

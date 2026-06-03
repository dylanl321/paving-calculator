-- Add waste_tons to log_entries to track field waste (spillage, trimming, joint waste)
-- distinct from placed_tons (asphalt on road) and rejected loads (loads turned away)
ALTER TABLE log_entries ADD COLUMN waste_tons REAL;

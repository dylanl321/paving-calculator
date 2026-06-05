-- Add tack coat tracking fields to org_materials
-- Tracks material_type (emulsion, cutback, trackless) and GDOT S413 residual_rate_gal_sy

ALTER TABLE org_materials ADD COLUMN material_type TEXT;
ALTER TABLE org_materials ADD COLUMN residual_rate_gal_sy REAL;

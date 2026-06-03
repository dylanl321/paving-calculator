-- Migration 0052: Multi-scope support on job sites.
-- scopes_json holds a JSON array of lowercase scope tags derived from the work
-- description and pay-item codes (e.g. ["milling","resurfacing","shoulder_rehab"]).
-- job_site_config.scope_of_work remains the single "primary" scope for backward
-- compatibility.

ALTER TABLE job_sites ADD COLUMN scopes_json TEXT;

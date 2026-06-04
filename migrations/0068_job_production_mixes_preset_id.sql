-- 0068_job_production_mixes_preset_id.sql
-- Add preset_id FK so job-site mixes can reference an org mix preset.

ALTER TABLE job_production_mixes ADD COLUMN preset_id TEXT REFERENCES org_mix_presets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_job_production_mixes_preset_id ON job_production_mixes (preset_id);

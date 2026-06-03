-- Add job_site_id column to audit_log for direct project-scoped querying
ALTER TABLE audit_log ADD COLUMN job_site_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_log_job_site ON audit_log(job_site_id, created_at DESC);

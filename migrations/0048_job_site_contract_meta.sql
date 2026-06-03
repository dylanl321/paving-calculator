-- Migration 0048: Contract / customer metadata captured from imported job-setup
-- and contract-summary documents (e.g. GDOT proposals). All optional; offline
-- calculator use is never gated on these.

ALTER TABLE job_sites ADD COLUMN job_number TEXT;
ALTER TABLE job_sites ADD COLUMN project_number TEXT;
ALTER TABLE job_sites ADD COLUMN contract_id TEXT;
ALTER TABLE job_sites ADD COLUMN work_type TEXT;
ALTER TABLE job_sites ADD COLUMN contract_type TEXT;
ALTER TABLE job_sites ADD COLUMN contract_amount REAL;
ALTER TABLE job_sites ADD COLUMN retainage_pct REAL;
ALTER TABLE job_sites ADD COLUMN est_start_date TEXT;
ALTER TABLE job_sites ADD COLUMN completion_date TEXT;
ALTER TABLE job_sites ADD COLUMN customer_name TEXT;
ALTER TABLE job_sites ADD COLUMN customer_address TEXT;
ALTER TABLE job_sites ADD COLUMN customer_contact TEXT;
ALTER TABLE job_sites ADD COLUMN customer_phone TEXT;
ALTER TABLE job_sites ADD COLUMN customer_email TEXT;
ALTER TABLE job_sites ADD COLUMN owner_name TEXT;
ALTER TABLE job_sites ADD COLUMN owner_address TEXT;
ALTER TABLE job_sites ADD COLUMN project_manager TEXT;
ALTER TABLE job_sites ADD COLUMN asphalt_supplier TEXT;
ALTER TABLE job_sites ADD COLUMN import_source_key TEXT;

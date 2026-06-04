-- Migration 0056: Source documents (original uploaded PDFs) for a job site.
-- Stores a row per imported PDF so the raw files can be downloaded later. The
-- file bytes live in R2 (key recorded here); this table is the metadata index.

CREATE TABLE IF NOT EXISTS job_documents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  doc_type TEXT,
  content_type TEXT NOT NULL DEFAULT 'application/pdf',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_documents_job_site ON job_documents(job_site_id);

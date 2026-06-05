-- Document feedback table for tracking unrecognized or partially-parsed PDFs.
-- Stores what we detected, what the user said it was, and a text sample for
-- future classifier training.
CREATE TABLE IF NOT EXISTS document_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  detected_type TEXT,
  user_corrected_type TEXT,
  text_sample TEXT,
  page_count INTEGER
);

CREATE INDEX IF NOT EXISTS idx_document_feedback_org
  ON document_feedback(org_id);

CREATE INDEX IF NOT EXISTS idx_document_feedback_type
  ON document_feedback(user_corrected_type);

CREATE INDEX IF NOT EXISTS idx_document_feedback_uploaded
  ON document_feedback(uploaded_at DESC);

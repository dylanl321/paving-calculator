-- Optional dates on a crew's assignment so the schedule can show overlaps.
ALTER TABLE crew_job_sites ADD COLUMN start_date TEXT;
ALTER TABLE crew_job_sites ADD COLUMN end_date TEXT;

-- One row per notification we have already decided to send, so a low-tonnage
-- alert does not fire on every load. Payload is the message; delivery is separate.
CREATE TABLE IF NOT EXISTS notification_dispatches (
  event_key   TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  payload     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

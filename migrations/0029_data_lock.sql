-- Migration: 0029_data_lock
-- Data lock enforcement after EOD close-out.
-- The closed_at column already exists on daily_logs (added in 0027_closeout.sql);
-- this migration maintains sequential numbering with no schema changes.
SELECT 1;

-- Link truck ticket photos to loads
ALTER TABLE loads ADD COLUMN ticket_photo_id TEXT REFERENCES photo_attachments(id);

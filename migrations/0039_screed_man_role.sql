-- Migration: add screed_man role to org_members and invitations
-- SQLite does not support ALTER COLUMN, so we recreate tables to update CHECK constraints

-- Drop the cascade trigger from 0038 that references org_members; recreated below.
-- (Rebuilding org_members while a trigger body references it raises
--  "no such table" during the DROP/RENAME, so it must be removed first.)
DROP TRIGGER IF EXISTS trg_cascade_delete_org_members;

-- 1. Add screed_man to org_members role constraint
CREATE TABLE org_members_new3 (
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office', 'laborer', 'screed_man')),
    invited_at INTEGER NOT NULL,
    accepted_at INTEGER,
    PRIMARY KEY (user_id, org_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO org_members_new3 SELECT * FROM org_members;
DROP TABLE org_members;
ALTER TABLE org_members_new3 RENAME TO org_members;

-- 2. Add screed_man to invitations role constraint
CREATE TABLE invitations_new3 (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office', 'laborer', 'screed_man')),
    token TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    accepted_at INTEGER,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO invitations_new3 SELECT * FROM invitations;
DROP TABLE invitations;
ALTER TABLE invitations_new3 RENAME TO invitations;

-- 3. Recreate the org_members cascade trigger (dropped above before the rebuild)
CREATE TRIGGER IF NOT EXISTS trg_cascade_delete_org_members
  BEFORE DELETE ON organizations
  FOR EACH ROW
BEGIN
  DELETE FROM org_members WHERE org_id = OLD.id;
END;

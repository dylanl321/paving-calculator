-- Migration: extend org_members and invitations role constraints
-- SQLite does not support ALTER COLUMN, so we recreate the tables

-- Extend org_members role constraint
CREATE TABLE org_members_new (
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office')),
    invited_at INTEGER NOT NULL,
    accepted_at INTEGER,
    PRIMARY KEY (user_id, org_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO org_members_new SELECT * FROM org_members;
DROP TABLE org_members;
ALTER TABLE org_members_new RENAME TO org_members;

-- Extend invitations role constraint
CREATE TABLE invitations_new (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office')),
    token TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    accepted_at INTEGER,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO invitations_new SELECT * FROM invitations;
DROP TABLE invitations;
ALTER TABLE invitations_new RENAME TO invitations;

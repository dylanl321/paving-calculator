-- Migration: add laborer role and crew-to-job-site assignment
-- SQLite does not support ALTER COLUMN, so we recreate tables to update CHECK constraints

-- 1. Add laborer to org_members role constraint
CREATE TABLE org_members_new2 (
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office', 'laborer')),
    invited_at INTEGER NOT NULL,
    accepted_at INTEGER,
    PRIMARY KEY (user_id, org_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO org_members_new2 SELECT * FROM org_members;
DROP TABLE org_members;
ALTER TABLE org_members_new2 RENAME TO org_members;

-- 2. Add laborer to invitations role constraint
CREATE TABLE invitations_new2 (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member', 'foreman', 'operator', 'inspector', 'office', 'laborer')),
    token TEXT NOT NULL UNIQUE,
    invited_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    accepted_at INTEGER,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO invitations_new2 SELECT * FROM invitations;
DROP TABLE invitations;
ALTER TABLE invitations_new2 RENAME TO invitations;

-- 3. Crew-to-job-site assignment table
-- A crew can be assigned to multiple job sites; a job site can have multiple crews
CREATE TABLE IF NOT EXISTS crew_job_sites (
  crew_id TEXT NOT NULL,
  job_site_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  assigned_by TEXT NOT NULL,
  PRIMARY KEY (crew_id, job_site_id),
  FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE,
  FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_crew_job_sites_crew ON crew_job_sites(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_job_sites_job_site ON crew_job_sites(job_site_id);
CREATE INDEX IF NOT EXISTS idx_crew_job_sites_org ON crew_job_sites(org_id);

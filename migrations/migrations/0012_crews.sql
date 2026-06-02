-- Named crew groups within an org
CREATE TABLE IF NOT EXISTS crews (
  id TEXT NOT NULL PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT 'slate',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Many-to-many: members can be in one crew per org
CREATE TABLE IF NOT EXISTS crew_members (
  crew_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, org_id),
  FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crews_org ON crews(org_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id);

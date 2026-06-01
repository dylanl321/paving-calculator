-- PaveRate D1 Database Schema
-- Migration 0001: Initial schema

-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_users_email ON users(email);

-- Organizations table
CREATE TABLE organizations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Organization members table
CREATE TABLE org_members (
    user_id TEXT NOT NULL,
    org_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'admin', 'member')),
    invited_at INTEGER NOT NULL DEFAULT (unixepoch()),
    accepted_at INTEGER,
    PRIMARY KEY (user_id, org_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);

-- Job sites table
CREATE TABLE job_sites (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    org_id TEXT NOT NULL,
    name TEXT NOT NULL,
    location_description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_sites_org_id ON job_sites(org_id);
CREATE INDEX idx_job_sites_status ON job_sites(status);

-- Job site assignments table
CREATE TABLE job_site_assignments (
    job_site_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
    role TEXT NOT NULL CHECK(role IN ('foreman', 'operator', 'inspector')),
    PRIMARY KEY (job_site_id, user_id),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_assignments_user_id ON job_site_assignments(user_id);
CREATE INDEX idx_job_site_assignments_job_site_id ON job_site_assignments(job_site_id);

-- Calculations table
CREATE TABLE calculations (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    calc_type TEXT NOT NULL CHECK(calc_type IN ('spread_rate', 'feet_left', 'tonnage', 'tack_rate', 'stick_check')),
    inputs TEXT NOT NULL, -- JSON
    result TEXT NOT NULL, -- JSON
    notes TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_calculations_job_site_id ON calculations(job_site_id);
CREATE INDEX idx_calculations_user_id ON calculations(user_id);
CREATE INDEX idx_calculations_created_at ON calculations(created_at);

-- Sessions table
CREATE TABLE sessions (
    id TEXT PRIMARY KEY, -- session token
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

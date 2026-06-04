-- =============================================================================
-- PaveRate D1 Full Schema — Fresh Environment Bootstrap
-- =============================================================================
-- This file is for NEW environments only:
--   new dev setups, CI, test environments, integration tests
--
-- DO NOT apply to any environment that has already run migrations/0001..0061.
-- Existing environments continue using the numbered migration sequence.
--
-- This consolidates migrations 0001–0061 with the following corrections applied:
--   - org_members / invitations use the FINAL role CHECK (as of 0039)
--   - work_zones.job_site_id is TEXT from the start (0033+0034 bug-fix merged)
--   - notification_schedules FK corrected: organizations(id) not orgs(id) (0060 bug)
--   - 0029 placeholder (SELECT 1) omitted — closed_at is in daily_logs directly
--   - Historical table-rebuild migrations (0010, 0019, 0039) omitted — final form used
-- =============================================================================

PRAGMA foreign_keys = ON;

-- =============================================================================
-- SECTION 1: Identity & Authentication
-- =============================================================================

-- Core user identity
CREATE TABLE users (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash       TEXT NOT NULL,
    name                TEXT NOT NULL,
    is_global_admin     BOOLEAN NOT NULL DEFAULT FALSE,
    disabled            BOOLEAN NOT NULL DEFAULT FALSE,
    phone               TEXT,
    email_verified      INTEGER NOT NULL DEFAULT 0,
    last_login_at       INTEGER,
    last_login_ip       TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_email_lower ON users(LOWER(email));

-- Session tokens
CREATE TABLE sessions (
    id          TEXT PRIMARY KEY, -- session token
    user_id     TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Email verification and password reset tokens
CREATE TABLE IF NOT EXISTS email_tokens (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    type        TEXT NOT NULL, -- "verify_email" | "reset_password"
    token       TEXT NOT NULL UNIQUE,
    expires_at  INTEGER NOT NULL,
    used_at     INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_email_tokens_token ON email_tokens(token);
CREATE INDEX idx_email_tokens_user_type ON email_tokens(user_id, type);

-- Admin security event log (login, register, password reset, verification)
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id          TEXT PRIMARY KEY,
    user_id     TEXT,
    org_id      TEXT,
    event_type  TEXT NOT NULL,
    ip_address  TEXT,
    user_agent  TEXT,
    metadata    TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_user ON admin_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_org ON admin_audit_log(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_type ON admin_audit_log(event_type, created_at DESC);

-- Rate limiting (IP + endpoint bucketed counters)
CREATE TABLE IF NOT EXISTS rate_limits (
    ip            TEXT NOT NULL,
    endpoint      TEXT NOT NULL,
    count         INTEGER NOT NULL DEFAULT 1,
    window_start  INTEGER NOT NULL,
    PRIMARY KEY (ip, endpoint)
);

-- =============================================================================
-- SECTION 2: Organizations
-- =============================================================================

-- Org accounts
CREATE TABLE organizations (
    id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    name                    TEXT NOT NULL,
    slug                    TEXT NOT NULL UNIQUE,
    address                 TEXT,
    superintendent_email    TEXT,
    superintendent_phone    TEXT,
    archived_at             INTEGER,
    created_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_organizations_slug ON organizations(slug);

-- User membership in an org with role
-- Final role set as of migration 0039 (screed_man added)
CREATE TABLE org_members (
    user_id         TEXT NOT NULL,
    org_id          TEXT NOT NULL,
    role            TEXT NOT NULL CHECK(role IN (
                        'owner','admin','member','foreman','operator',
                        'inspector','office','laborer','screed_man'
                    )),
    preferred_view  TEXT,
    invited_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    accepted_at     INTEGER,
    PRIMARY KEY (user_id, org_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_org_members_org_id ON org_members(org_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);

-- Pending invitations to join an org
CREATE TABLE IF NOT EXISTS invitations (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    org_id      TEXT NOT NULL,
    email       TEXT NOT NULL COLLATE NOCASE,
    role        TEXT NOT NULL CHECK(role IN (
                    'owner','admin','member','foreman','operator',
                    'inspector','office','laborer','screed_man'
                )),
    token       TEXT NOT NULL UNIQUE,
    invited_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    accepted_at INTEGER,
    expires_at  INTEGER NOT NULL,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_invitations_token ON invitations(token);
CREATE INDEX idx_invitations_org_id ON invitations(org_id);
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_expires_at ON invitations(expires_at);

-- Org-level settings: branding, config overrides, email defaults
CREATE TABLE org_settings (
    org_id              TEXT PRIMARY KEY,
    accent_color        TEXT,
    logo_key            TEXT,
    logo_content_type   TEXT,
    overrides           TEXT,   -- JSON blob of config key overrides
    email_from_name     TEXT,
    email_reply_to      TEXT,
    report_recipients   TEXT,   -- JSON array of email strings
    updated_by          TEXT,
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_org_settings_org_id ON org_settings(org_id);

-- Named crew groups within an org
CREATE TABLE IF NOT EXISTS crews (
    id          TEXT NOT NULL PRIMARY KEY,
    org_id      TEXT NOT NULL,
    name        TEXT NOT NULL,
    color       TEXT NOT NULL DEFAULT 'slate',
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_crews_org ON crews(org_id);

-- Crew membership (one crew per user per org)
CREATE TABLE IF NOT EXISTS crew_members (
    crew_id     TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    org_id      TEXT NOT NULL,
    assigned_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, org_id),
    FOREIGN KEY (crew_id) REFERENCES crews(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crew_members_crew ON crew_members(crew_id);

-- Per-user notification preference flags
CREATE TABLE IF NOT EXISTS user_notification_prefs (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pref_key    TEXT NOT NULL,
    enabled     INTEGER NOT NULL DEFAULT 1,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, pref_key)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_prefs_user ON user_notification_prefs(user_id);

-- Outbound webhooks for external integrations
CREATE TABLE IF NOT EXISTS webhooks (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL,
    url         TEXT NOT NULL,
    secret      TEXT NOT NULL,
    events      TEXT NOT NULL,  -- JSON array of event types
    description TEXT,
    is_active   INTEGER DEFAULT 1,
    created_by  TEXT,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhooks_org_id ON webhooks(org_id);

-- Webhook delivery log
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id              TEXT PRIMARY KEY,
    webhook_id      TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         TEXT NOT NULL,  -- JSON
    status          TEXT NOT NULL CHECK(status IN ('pending', 'delivered', 'failed')),
    http_status     INTEGER,
    response_body   TEXT,
    attempt_count   INTEGER DEFAULT 0,
    last_attempted_at INTEGER,
    delivered_at    INTEGER,
    created_at      INTEGER NOT NULL,
    FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- Immutable action audit log (UPDATE and DELETE are blocked by triggers below)
CREATE TABLE IF NOT EXISTS audit_log (
    id              TEXT PRIMARY KEY,
    actor_user_id   TEXT,
    actor_name      TEXT,
    org_id          TEXT NOT NULL,
    job_site_id     TEXT,
    resource_type   TEXT NOT NULL,
    resource_id     TEXT NOT NULL,
    action          TEXT NOT NULL,
    old_value       TEXT,
    new_value       TEXT,
    ip_address      TEXT,
    user_agent      TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_audit_log_org ON audit_log(org_id, created_at DESC);
CREATE INDEX idx_audit_log_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_actor ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_job_site ON audit_log(job_site_id, created_at DESC);

-- Enforce audit_log immutability
CREATE TRIGGER audit_log_immutable_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;
CREATE TRIGGER audit_log_immutable_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit_log is immutable'); END;

-- Email send attempts (feeds admin debug viewer)
CREATE TABLE IF NOT EXISTS email_log (
    id                  TEXT PRIMARY KEY,
    to_email            TEXT NOT NULL,
    from_email          TEXT NOT NULL,
    subject             TEXT NOT NULL,
    type                TEXT NOT NULL,
    org_id              TEXT,
    user_id             TEXT,
    status              TEXT NOT NULL,
    provider_message_id TEXT,
    error               TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_email_log_created_at ON email_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_log_to_email ON email_log(to_email);

-- Per-org custom email templates
CREATE TABLE IF NOT EXISTS email_templates (
    id              TEXT PRIMARY KEY,
    org_id          TEXT,
    template_key    TEXT NOT NULL,
    subject         TEXT NOT NULL,
    body_html       TEXT NOT NULL,
    body_text       TEXT,
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_by      TEXT,
    UNIQUE(org_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_email_templates_org_key ON email_templates(org_id, template_key);

-- Scheduled email delivery of reports
CREATE TABLE IF NOT EXISTS email_report_schedules (
    id          TEXT PRIMARY KEY,
    org_id      TEXT NOT NULL,
    report_type TEXT NOT NULL CHECK(report_type IN ('daily_summary', 'weekly_rollup', 'monthly_rollup')),
    frequency   TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly')),
    send_hour   INTEGER NOT NULL DEFAULT 8,     -- 0-23 UTC hour to send
    day_of_week INTEGER,                         -- 0=Sun..6=Sat for weekly
    recipients  TEXT NOT NULL DEFAULT '[]',      -- JSON array of email strings
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_by  TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    last_sent_at INTEGER,
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_report_schedules_org ON email_report_schedules(org_id);
CREATE INDEX IF NOT EXISTS idx_email_report_schedules_enabled ON email_report_schedules(enabled, frequency);

-- Configurable notification delivery schedules (EOD summary, weekly report)
-- NOTE: FK corrected from orgs(id) -> organizations(id) (bug in original 0060)
CREATE TABLE IF NOT EXISTS notification_schedules (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    org_id          TEXT NOT NULL,
    schedule_type   TEXT NOT NULL CHECK (schedule_type IN ('eod_summary', 'weekly_report')),
    enabled         INTEGER NOT NULL DEFAULT 1,
    send_time       TEXT NOT NULL DEFAULT '17:00',
    timezone        TEXT NOT NULL DEFAULT 'America/Chicago',
    recipients      TEXT NOT NULL DEFAULT '[]',
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notification_schedules_org_id ON notification_schedules(org_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_schedules_org_type ON notification_schedules(org_id, schedule_type);

-- =============================================================================
-- SECTION 3: Job Sites / Projects
-- =============================================================================

-- Project records (called "Job Sites" in the UI)
CREATE TABLE job_sites (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    org_id              TEXT NOT NULL,
    name                TEXT NOT NULL,
    location_description TEXT,
    status              TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'archived')),
    latitude            REAL,
    longitude           REAL,
    geometry_geojson    TEXT,
    geometry_updated_at INTEGER,
    gdot_county         TEXT,
    gdot_district       TEXT,
    scopes_json         TEXT,   -- JSON array of scope tags
    -- Contract / customer metadata (from imported GDOT proposals etc.)
    job_number          TEXT,
    project_number      TEXT,
    contract_id         TEXT,
    work_type           TEXT,
    contract_type       TEXT,
    contract_amount     REAL,
    retainage_pct       REAL,
    est_start_date      TEXT,
    completion_date     TEXT,
    customer_name       TEXT,
    customer_address    TEXT,
    customer_contact    TEXT,
    customer_phone      TEXT,
    customer_email      TEXT,
    owner_name          TEXT,
    owner_address       TEXT,
    project_manager     TEXT,
    asphalt_supplier    TEXT,
    import_source_key   TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_sites_org_id ON job_sites(org_id);
CREATE INDEX idx_job_sites_status ON job_sites(status);

-- User:project role assignments
CREATE TABLE job_site_assignments (
    job_site_id TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
    role        TEXT NOT NULL CHECK(role IN ('foreman', 'operator', 'inspector')),
    PRIMARY KEY (job_site_id, user_id),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_assignments_user_id ON job_site_assignments(user_id);
CREATE INDEX idx_job_site_assignments_job_site_id ON job_site_assignments(job_site_id);

-- Crew-to-project assignments
CREATE TABLE IF NOT EXISTS crew_job_sites (
    crew_id     TEXT NOT NULL,
    job_site_id TEXT NOT NULL,
    org_id      TEXT NOT NULL,
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

-- Paving configuration per project
CREATE TABLE job_site_config (
    job_site_id         TEXT PRIMARY KEY,
    road_type           TEXT CHECK(road_type IN ('highway', 'state_route', 'county_road', 'city_street', 'subdivision', 'parking_lot', 'other')),
    num_lanes           INTEGER,
    lane_width_ft       REAL DEFAULT 12,
    total_length_ft     REAL,
    scope_of_work       TEXT CHECK(scope_of_work IN ('full_depth', 'mill_and_fill', 'overlay', 'leveling', 'patching', 'widening')),
    mix_type            TEXT,
    target_thickness_in REAL,
    target_spread_rate  REAL,
    tack_type           TEXT CHECK(tack_type IN ('anionic', 'cationic', 'polymer_modified', 'trackless')),
    target_tack_rate    REAL,
    num_lifts           INTEGER,
    total_tonnage       REAL,
    cost_per_ton        REAL,
    cost_per_sy         REAL,
    cost_per_mile       REAL,
    total_contract_value REAL,
    route_designation   TEXT,
    route_county        TEXT,
    route_district      TEXT,
    route_functional_class TEXT,
    route_system_code   TEXT,
    notes               TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_config_job_site_id ON job_site_config(job_site_id);

-- Equipment roster per project
CREATE TABLE job_site_equipment (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id     TEXT NOT NULL,
    equipment_type  TEXT NOT NULL CHECK(equipment_type IN ('paver', 'shuttle_buggy', 'roller_breakdown', 'roller_intermediate', 'roller_finish', 'distributor', 'milling_machine', 'other')),
    name            TEXT NOT NULL,
    capacity        TEXT,
    notes           TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_equipment_job_site_id ON job_site_equipment(job_site_id);

-- Route/alignment polylines for map view
CREATE TABLE IF NOT EXISTS job_site_routes (
    job_site_id TEXT PRIMARY KEY,
    waypoints   TEXT NOT NULL, -- JSON array of {lat, lng}
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_site_routes_updated ON job_site_routes(updated_at);

-- Project milestones / phase tracking
CREATE TABLE IF NOT EXISTS job_site_milestones (
    id          TEXT PRIMARY KEY,
    job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    target_date TEXT,
    completed_at INTEGER,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_site_milestones_job_site_id ON job_site_milestones(job_site_id);

-- Plan-sheet images extracted from contract PDF
CREATE TABLE IF NOT EXISTS job_schematics (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    r2_key      TEXT NOT NULL,
    page_number INTEGER,
    label       TEXT,
    content_type TEXT NOT NULL DEFAULT 'image/png',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_schematics_job_site ON job_schematics(job_site_id);

-- Source PDF uploads (raw files in R2, metadata here)
CREATE TABLE IF NOT EXISTS job_documents (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    r2_key      TEXT NOT NULL,
    filename    TEXT NOT NULL,
    doc_type    TEXT,
    content_type TEXT NOT NULL DEFAULT 'application/pdf',
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_documents_job_site ON job_documents(job_site_id);

-- Contract bid / pay items (from GDOT schedule of items etc.)
CREATE TABLE IF NOT EXISTS job_bid_items (
    id          TEXT PRIMARY KEY,
    job_site_id TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    line_number TEXT,
    item_id     TEXT,
    description TEXT NOT NULL,
    quantity    REAL,
    unit        TEXT,
    unit_price  REAL,
    bid_amount  REAL,
    section     TEXT,
    is_alternate INTEGER NOT NULL DEFAULT 0,
    selected    INTEGER NOT NULL DEFAULT 1,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_bid_items_job_site ON job_bid_items(job_site_id);

-- Per-mix production plan (paving spec, tonnage, daily rate)
CREATE TABLE IF NOT EXISTS job_production_mixes (
    id                  TEXT PRIMARY KEY,
    job_site_id         TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    mix_name            TEXT NOT NULL,
    unit                TEXT,
    bid_quantity        REAL,
    takeoff_tonnage     REAL,
    quantity_per_day    REAL,
    est_days            REAL,
    mix_type            TEXT,
    target_thickness_in REAL,
    target_spread_rate  REAL,
    tack_type           TEXT,
    target_tack_rate    REAL,
    is_active           INTEGER NOT NULL DEFAULT 0,
    contract_unit_price REAL,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_job_production_mixes_job_site ON job_production_mixes(job_site_id);

-- Active paving sections (named segments of road being worked)
CREATE TABLE IF NOT EXISTS road_sections (
    id                  TEXT PRIMARY KEY,
    job_site_id         TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    lane                TEXT NOT NULL DEFAULT '1',
    station_start       REAL,
    station_end         REAL,
    status              TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'skipped')),
    geometry_geojson    TEXT,
    production_mix_id   TEXT,
    layer_label         TEXT,
    planned_length_ft   REAL,
    state_dot           TEXT,           -- optional 2-letter state code for DOT linkage
    external_segment_id TEXT,           -- soft FK into dot_road_segments.external_id
    dot_source          TEXT,           -- agency identifier
    notes               TEXT,
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_road_sections_job_site ON road_sections(job_site_id);
CREATE INDEX IF NOT EXISTS idx_road_sections_status ON road_sections(job_site_id, status);
CREATE INDEX IF NOT EXISTS idx_road_sections_dot ON road_sections(state_dot, external_segment_id)
    WHERE state_dot IS NOT NULL;

-- Paving/milling zone polygons drawn on the map
-- NOTE: job_site_id is TEXT to match job_sites.id (0033 had INTEGER bug, fixed in 0034)
CREATE TABLE IF NOT EXISTS work_zones (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id          TEXT NOT NULL,
    job_site_id     TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    zone_type       TEXT NOT NULL CHECK(zone_type IN ('paving','milling','tack','base','other')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','complete','hold')),
    geometry_geojson TEXT,
    color           TEXT,
    notes           TEXT,
    created_by      TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_work_zones_org_job_site ON work_zones(org_id, job_site_id);

-- Georeferenced plan sheet overlays for the map
CREATE TABLE IF NOT EXISTS plan_sheet_georef (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_site_id     TEXT NOT NULL,
    title           TEXT NOT NULL,
    pdf_url         TEXT NOT NULL,
    thumbnail_url   TEXT,
    bounds_ne_lat   REAL,
    bounds_ne_lng   REAL,
    bounds_sw_lat   REAL,
    bounds_sw_lng   REAL,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_plan_sheet_georef_job_site_id ON plan_sheet_georef(job_site_id);

-- =============================================================================
-- SECTION 4: Field Operations
-- =============================================================================

-- Daily production logs (one per project per day)
CREATE TABLE daily_logs (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id         TEXT NOT NULL,
    log_date            TEXT NOT NULL,  -- YYYY-MM-DD
    created_by          TEXT NOT NULL,
    weather_temp_f      REAL,
    weather_conditions  TEXT CHECK(weather_conditions IN ('clear', 'cloudy', 'rain', 'wind', 'fog')),
    wind_speed_mph      REAL,
    crew_count          INTEGER,
    start_time          TEXT,   -- HH:MM
    end_time            TEXT,   -- HH:MM
    target_tons         REAL,
    target_loads        INTEGER,
    plant_name          TEXT,
    mix_type            TEXT,
    closed_at           INTEGER,
    foreman_name        TEXT,
    notes               TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(job_site_id, log_date)
);

CREATE INDEX idx_daily_logs_job_site_id ON daily_logs(job_site_id);
CREATE INDEX idx_daily_logs_log_date ON daily_logs(log_date);
CREATE INDEX idx_daily_logs_created_by ON daily_logs(created_by);

-- Individual paving/milling/tack/break events within a daily log
CREATE TABLE log_entries (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    daily_log_id    TEXT NOT NULL,
    entry_type      TEXT NOT NULL CHECK(entry_type IN ('paving', 'milling', 'tack', 'break', 'delay', 'note')),
    timestamp       TEXT NOT NULL,   -- HH:MM
    station_start   REAL,
    station_end     REAL,
    distance_ft     REAL,
    tons_placed     REAL,
    loads_count     INTEGER,
    truck_tickets   TEXT,            -- JSON array of ticket numbers
    spread_rate_actual REAL,         -- lbs/sq yd
    tack_gallons    REAL,
    lane            TEXT,
    pass_number     INTEGER,
    waste_tons      REAL,
    notes           TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE CASCADE
);

CREATE INDEX idx_log_entries_daily_log_id ON log_entries(daily_log_id);
CREATE INDEX idx_log_entries_entry_type ON log_entries(entry_type);
CREATE INDEX idx_log_entries_timestamp ON log_entries(timestamp);
CREATE INDEX IF NOT EXISTS idx_log_entries_lane_pass ON log_entries(daily_log_id, lane, pass_number);

-- Per-load ticket records
CREATE TABLE IF NOT EXISTS loads (
    id              TEXT PRIMARY KEY,
    job_site_id     TEXT NOT NULL REFERENCES job_sites(id),
    user_id         TEXT NOT NULL REFERENCES users(id),
    ticket_number   TEXT,
    tons            REAL NOT NULL,
    timestamp       INTEGER NOT NULL,
    spread_rate     REAL,
    lane_number     INTEGER,
    pass_number     INTEGER,
    rejected        INTEGER NOT NULL DEFAULT 0,
    rejection_reason TEXT,
    rejection_notes TEXT,
    ticket_photo_id TEXT REFERENCES photo_attachments(id),
    notes           TEXT,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_loads_job_site ON loads(job_site_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_loads_user ON loads(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_loads_lane ON loads(job_site_id, lane_number, timestamp DESC);

-- Historical load rejection details
CREATE TABLE IF NOT EXISTS load_rejections (
    id          TEXT PRIMARY KEY,
    load_id     TEXT NOT NULL REFERENCES loads(id),
    reason      TEXT NOT NULL CHECK(reason IN ('temp_too_low', 'temp_too_high', 'wrong_mix', 'contaminated', 'overloaded', 'underweight', 'damaged_in_transit', 'other')),
    notes       TEXT,
    rejected_by TEXT NOT NULL REFERENCES users(id),
    rejected_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_load_rejections_load ON load_rejections(load_id);

-- Trucks en-route to job site with ETA tracking
CREATE TABLE IF NOT EXISTS truck_queue (
    id                  TEXT PRIMARY KEY,
    job_site_id         TEXT NOT NULL REFERENCES job_sites(id) ON DELETE CASCADE,
    truck_number        TEXT NOT NULL,
    estimated_tons      REAL,
    departure_time      INTEGER NOT NULL,
    travel_time_minutes INTEGER NOT NULL DEFAULT 30,
    status              TEXT NOT NULL DEFAULT 'en_route' CHECK(status IN ('en_route', 'arrived', 'dismissed')),
    arrived_at          INTEGER,
    created_by          TEXT NOT NULL REFERENCES users(id),
    created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_truck_queue_job_site ON truck_queue(job_site_id, status, departure_time);
CREATE INDEX IF NOT EXISTS idx_truck_queue_eta ON truck_queue(job_site_id, status, departure_time, travel_time_minutes);

-- Nuclear gauge density readings
CREATE TABLE IF NOT EXISTS density_readings (
    id                  TEXT PRIMARY KEY,
    daily_log_id        TEXT NOT NULL REFERENCES daily_logs(id) ON DELETE CASCADE,
    station_number      REAL NOT NULL,
    lane                TEXT,
    reading_number      INTEGER NOT NULL DEFAULT 1,
    wet_density_pcf     REAL NOT NULL,
    moisture_pct        REAL NOT NULL,
    dry_density_pcf     REAL,
    target_density_pcf  REAL,
    compaction_pct      REAL,
    depth_in            REAL,
    notes               TEXT,
    created_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_density_readings_log ON density_readings(daily_log_id);

-- Geotagged field photos
CREATE TABLE photo_attachments (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id     TEXT NOT NULL,
    daily_log_id    TEXT,
    log_entry_id    TEXT,
    r2_key          TEXT NOT NULL,
    filename        TEXT NOT NULL,
    caption         TEXT,
    lat             REAL,
    lng             REAL,
    gps_accuracy_m  REAL,
    taken_at        INTEGER NOT NULL,
    uploaded_by     TEXT NOT NULL,
    created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (daily_log_id) REFERENCES daily_logs(id) ON DELETE SET NULL,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_photo_attachments_job_site_id ON photo_attachments(job_site_id);
CREATE INDEX idx_photo_attachments_daily_log_id ON photo_attachments(daily_log_id);

-- Live crew GPS pings (one row per user per org, upserted)
CREATE TABLE IF NOT EXISTS crew_locations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id      TEXT NOT NULL,
    job_site_id INTEGER,
    user_id     TEXT NOT NULL,
    display_name TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'crew',
    lat         REAL NOT NULL,
    lng         REAL NOT NULL,
    accuracy    REAL,
    heading     REAL,
    speed       REAL,
    status      TEXT NOT NULL DEFAULT 'active',
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_crew_locations_org ON crew_locations(org_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_crew_locations_job_site ON crew_locations(job_site_id, updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crew_locations_user_org ON crew_locations(org_id, user_id);

-- =============================================================================
-- SECTION 5: External Data (DOT road segments)
-- =============================================================================

-- Multi-state DOT road reference data (ALDOT, TxDOT, GDOT, FDOT, etc.)
CREATE TABLE IF NOT EXISTS dot_road_segments (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    state_dot           TEXT NOT NULL CHECK(length(state_dot) = 2),
    source              TEXT NOT NULL,
    external_id         TEXT NOT NULL,
    road_name           TEXT,
    route_id            TEXT,
    functional_class    INTEGER,
    surface_type        TEXT,
    iri                 REAL,
    pci                 REAL,
    psr                 REAL,
    begin_milepost      REAL,
    end_milepost        REAL,
    length_miles        REAL,
    lanes               INTEGER,
    aadt                INTEGER,
    district_code       TEXT,
    county_code         TEXT,
    geometry_geojson    TEXT,
    raw_json            TEXT,
    data_year           INTEGER,
    fetched_at          INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dot_segments_external ON dot_road_segments(state_dot, source, external_id);
CREATE INDEX IF NOT EXISTS idx_dot_segments_state ON dot_road_segments(state_dot);
CREATE INDEX IF NOT EXISTS idx_dot_segments_route ON dot_road_segments(state_dot, route_id);
CREATE INDEX IF NOT EXISTS idx_dot_segments_county ON dot_road_segments(state_dot, county_code);

-- Tracks the last successful DOT data sync per (state, source)
CREATE TABLE IF NOT EXISTS dot_sync_log (
    id                  TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    state_dot           TEXT NOT NULL CHECK(length(state_dot) = 2),
    source              TEXT NOT NULL,
    status              TEXT NOT NULL CHECK(status IN ('success', 'partial', 'failed')),
    records_upserted    INTEGER NOT NULL DEFAULT 0,
    error_message       TEXT,
    synced_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_dot_sync_log_state_source ON dot_sync_log(state_dot, source, synced_at DESC);

-- =============================================================================
-- SECTION 6: Calculators
-- =============================================================================

-- Calculator run history
CREATE TABLE calculations (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    job_site_id TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    calc_type   TEXT NOT NULL CHECK(calc_type IN ('spread_rate', 'feet_left', 'tonnage', 'tack_rate', 'stick_check')),
    inputs      TEXT NOT NULL, -- JSON
    result      TEXT NOT NULL, -- JSON
    notes       TEXT,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (job_site_id) REFERENCES job_sites(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_calculations_job_site_id ON calculations(job_site_id);
CREATE INDEX idx_calculations_user_id ON calculations(user_id);
CREATE INDEX idx_calculations_created_at ON calculations(created_at);

-- =============================================================================
-- SECTION 7: Cascade triggers
-- =============================================================================
-- D1/SQLite doesn't support ALTER TABLE ADD CONSTRAINT for existing tables.
-- These triggers implement the intended ON DELETE CASCADE behavior.

-- organizations -> org_members
CREATE TRIGGER IF NOT EXISTS trg_cascade_delete_org_members
    BEFORE DELETE ON organizations
    FOR EACH ROW
BEGIN
    DELETE FROM org_members WHERE org_id = OLD.id;
END;

-- daily_logs -> log_entries
CREATE TRIGGER IF NOT EXISTS trg_cascade_delete_log_entries
    BEFORE DELETE ON daily_logs
    FOR EACH ROW
BEGIN
    DELETE FROM log_entries WHERE daily_log_id = OLD.id;
END;

-- job_sites -> daily_logs (which fires trg_cascade_delete_log_entries in turn)
CREATE TRIGGER IF NOT EXISTS trg_cascade_delete_daily_logs
    BEFORE DELETE ON job_sites
    FOR EACH ROW
BEGIN
    DELETE FROM daily_logs WHERE job_site_id = OLD.id;
END;

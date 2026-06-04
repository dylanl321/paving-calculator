# Migration Audit and Consolidation Plan

Generated: 2026-06-04

## Current State

61 migration files (0001–0061) in `migrations/`. No duplicate numbers. No nested `migrations/migrations/` folder currently present (may have been cleaned up). All files are sequential with no gaps except one placeholder.

---

## Migration Inventory

| # | File | Action | Tables Affected |
|---|------|--------|----------------|
| 0001 | initial_schema | CREATE | users, organizations, org_members, job_sites, job_site_assignments, calculations, sessions + 9 indexes |
| 0002 | admin_fields | ALTER + CREATE | users (is_global_admin, disabled, phone); invitations (new table) |
| 0003 | job_site_config | CREATE | job_site_config, job_site_equipment |
| 0004 | daily_logs | CREATE | daily_logs, log_entries |
| 0005 | org_settings | CREATE | org_settings |
| 0006 | email_tokens | ALTER + CREATE | users (email_verified); email_tokens (new table) |
| 0007 | audit_log | CREATE + TRIGGERS | audit_log; immutability triggers (UPDATE/DELETE blocked) |
| 0008 | job_site_coordinates | ALTER | job_sites (+latitude, +longitude) |
| 0009 | job_site_route | CREATE | job_site_routes |
| 0010 | extended_roles | RECREATE | org_members (role CHECK expanded: +foreman,operator,inspector,office); invitations (same) |
| 0011 | photo_attachments | CREATE | photo_attachments |
| 0012 | webhooks | CREATE | webhooks, webhook_deliveries |
| 0013 | crews | CREATE | crews, crew_members |
| 0014 | email_branding | ALTER | org_settings (+email_from_name, +email_reply_to) |
| 0015 | job_site_lifts_tonnage | ALTER | job_site_config (+num_lifts, +total_tonnage) |
| 0016 | notification_prefs | CREATE | user_notification_prefs |
| 0017 | job_site_costs | ALTER | job_site_config (+cost_per_ton, +cost_per_sy, +cost_per_mile, +total_contract_value) |
| 0018 | milestones | CREATE | job_site_milestones (comment header says "0016" — stale copy-paste in header only) |
| 0019 | laborer_role_crew_jobsite | RECREATE | org_members (role CHECK +laborer); invitations (same); crew_job_sites (new table) |
| 0020 | loads | CREATE | loads |
| 0021 | load_rejections | CREATE | load_rejections |
| 0022 | truck_queue | CREATE | truck_queue |
| 0023 | density_readings | CREATE | density_readings |
| 0024 | daily_targets | ALTER | daily_logs (+target_tons, +target_loads, +plant_name, +mix_type) |
| 0025 | geojson_geometry | ALTER | job_sites (+geometry_geojson, +geometry_updated_at) |
| 0026 | loads_lane_pass | ALTER + INDEX | loads (+lane_number, +pass_number) |
| 0027 | closeout | ALTER | daily_logs (+closed_at, +foreman_name) |
| 0028 | log_entries_pass_number | ALTER + INDEX | log_entries (+pass_number) |
| 0029 | data_lock | NOOP | `SELECT 1` placeholder — no schema change |
| 0030 | loads_ticket_photo | ALTER | loads (+ticket_photo_id FK->photo_attachments) |
| 0031 | road_sections | CREATE | road_sections |
| 0032 | crew_locations | CREATE | crew_locations |
| 0033 | work_zones | CREATE | work_zones (job_site_id INTEGER — BUG, fixed by 0034) |
| 0034 | work_zones_jobsite_text | RECREATE | work_zones (job_site_id INTEGER->TEXT fix; PRAGMA foreign_keys OFF/ON) |
| 0035 | email_log | CREATE | email_log |
| 0036 | org_archived_at | ALTER | organizations (+archived_at) |
| 0037 | waste_tons | ALTER | log_entries (+waste_tons) |
| 0038 | cascade_triggers_and_email_index | CREATE TRIGGERS + INDEX | (no new tables); trigger: trg_cascade_delete_org_members, trg_cascade_delete_log_entries, trg_cascade_delete_daily_logs; index: idx_users_email_lower |
| 0039 | screed_man_role | RECREATE + TRIGGER | org_members (role CHECK +screed_man); invitations (same); drops/recreates trg_cascade_delete_org_members |
| 0040 | org_general_info | ALTER | organizations (+address, +superintendent_email, +superintendent_phone) [comment header says "0024" — stale] |
| 0041 | rate_limits | CREATE | rate_limits |
| 0042 | dot_road_data | CREATE + ALTER | dot_road_segments, dot_sync_log; road_sections (+state_dot, +external_segment_id, +dot_source) |
| 0043 | email_report_schedules | CREATE | email_report_schedules |
| 0044 | report_recipients | ALTER | org_settings (+report_recipients) |
| 0045 | audit_log_job_site_id | ALTER + INDEX | audit_log (+job_site_id) |
| 0046 | route_designation | ALTER | job_site_config (+route_designation, +route_county, +route_district, +route_functional_class, +route_system_code) |
| 0047 | job_site_gdot_fields | ALTER | job_sites (+gdot_county, +gdot_district) |
| 0048 | job_site_contract_meta | ALTER | job_sites (+job_number, +project_number, +contract_id, +work_type, +contract_type, +contract_amount, +retainage_pct, +est_start_date, +completion_date, +customer_name, +customer_address, +customer_contact, +customer_phone, +customer_email, +owner_name, +owner_address, +project_manager, +asphalt_supplier, +import_source_key) — 19 columns |
| 0049 | job_bid_items | CREATE | job_bid_items |
| 0050 | job_production_mixes | CREATE | job_production_mixes |
| 0051 | bid_item_alternate_flags | ALTER | job_bid_items (+is_alternate, +selected) |
| 0052 | job_site_scopes | ALTER | job_sites (+scopes_json) |
| 0053 | production_mix_paving_spec | ALTER | job_production_mixes (+mix_type, +target_thickness_in, +target_spread_rate, +tack_type, +target_tack_rate, +is_active) |
| 0054 | job_schematics | CREATE | job_schematics |
| 0055 | production_mix_unit_price | ALTER | job_production_mixes (+contract_unit_price) |
| 0056 | job_documents | CREATE | job_documents |
| 0057 | admin_audit_log | CREATE + ALTER | admin_audit_log; users (+last_login_at, +last_login_ip) |
| 0058 | email_templates | CREATE | email_templates |
| 0059 | preferred_view | ALTER | org_members (+preferred_view) |
| 0060 | notification_schedules | CREATE | notification_schedules (WARNING: FK references `orgs(id)` — should be `organizations(id)`) |
| 0061 | plan_sheet_georef | CREATE | plan_sheet_georef |

---

## Issues Found

### 1. Placeholder Migration (0029)
`0029_data_lock.sql` contains only `SELECT 1;` with a comment that `closed_at` already exists from 0027. This is a no-op that holds a sequence slot. It is harmless but should be documented so future devs know it is intentional.

### 2. Stale Comment Headers
- `0018_milestones.sql` header comment says "Migration: 0016_milestones" (stale copy-paste).
- `0040_org_general_info.sql` header comment says "Migration 0024" (stale copy-paste).
These are cosmetic and do not affect runtime.

### 3. Bug-Fix Migration Pair (0033 + 0034)
`0033_work_zones.sql` created `work_zones.job_site_id` as `INTEGER` when `job_sites.id` is `TEXT`. `0034_work_zones_jobsite_text.sql` immediately recreates the table to fix this. Both must be applied together. In a fresh consolidated schema these two collapse into one correct `CREATE TABLE`.

### 4. role CHECK Constraint Rebuilt Three Times (0010, 0019, 0039)
Because SQLite has no `ALTER COLUMN`, the `org_members` and `invitations` tables are dropped-and-recreated to extend the role CHECK constraint:
- 0010: adds foreman, operator, inspector, office
- 0019: adds laborer
- 0039: adds screed_man (also drops/recreates the 0038 cascade trigger)

Final CHECK value (as of 0039):
```
role IN ('owner','admin','member','foreman','operator','inspector','office','laborer','screed_man')
```
In a consolidated schema this is a single `CREATE TABLE` with the final CHECK.

### 5. Wrong FK in 0060_notification_schedules
`0060_notification_schedules.sql` references `FOREIGN KEY (org_id) REFERENCES orgs(id)` but the table is named `organizations`. This will cause a runtime FK violation error when `PRAGMA foreign_keys = ON`. Should be `REFERENCES organizations(id)`.

### 6. Cascade Trigger Interaction (0038 + 0039)
`0039` drops `trg_cascade_delete_org_members` before rebuilding `org_members`, then recreates it. This is correct but fragile — if another migration rebuilds `org_members` in the future it must repeat this pattern.

### 7. job_site_config: Fragmented Columns
`job_site_config` receives columns in five separate migrations (0003, 0015, 0017, 0046). Final column list is large. Not a bug, but in a consolidated schema all these belong in one `CREATE TABLE`.

### 8. job_sites: 19-Column Dump in 0048
`0048_job_site_contract_meta.sql` adds 19 columns to `job_sites` in one migration. These were bulk-added from a PDF parser feature. No conflict, but consolidation should group them logically.

---

## Tables in Final Schema

### Core Auth
- `users` — auth identity (0001 + 0002 + 0006 + 0057)
- `sessions` — session tokens (0001)
- `email_tokens` — verify/reset tokens (0006)
- `admin_audit_log` — auth security events (0057)

### Organizations
- `organizations` — org records (0001 + 0036 + 0040)
- `org_members` — user:org:role (0001, rebuilt in 0010, 0019, 0039; +preferred_view in 0059)
- `org_settings` — branding + overrides (0005 + 0014 + 0044)
- `invitations` — pending invites (0002, rebuilt in 0010, 0019, 0039)
- `crews` — named crew groups (0013)
- `crew_members` — user:crew (0013)
- `crew_job_sites` — crew:job_site assignments (0019)
- `user_notification_prefs` — per-user notification flags (0016)
- `notification_schedules` — org-level scheduled notifications (0060)
- `rate_limits` — IP+endpoint rate limiting (0041)
- `webhooks` — outbound webhooks (0012)
- `webhook_deliveries` — webhook delivery log (0012)
- `audit_log` — immutable action log (0007 + 0045)
- `email_log` — email send attempts (0035)
- `email_templates` — per-org custom email templates (0058)
- `email_report_schedules` — scheduled email reports (0043)

### Job Sites / Projects
- `job_sites` — project records (0001 + 0008 + 0025 + 0047 + 0048 + 0052)
- `job_site_assignments` — user:project role (0001)
- `job_site_config` — paving config per project (0003 + 0015 + 0017 + 0046)
- `job_site_routes` — route polylines (0009)
- `job_site_milestones` — project milestones (0018)
- `job_schematics` — plan-sheet images from PDF (0054)
- `job_documents` — source PDF uploads (0056)
- `job_bid_items` — contract pay items (0049 + 0051)
- `job_production_mixes` — per-mix paving plan (0050 + 0053 + 0055)
- `road_sections` — active paving sections (0031 + 0042)
- `work_zones` — paving/milling zone polygons (0033+0034)
- `plan_sheet_georef` — georeferenced plan sheet overlays (0061)

### Field Operations
- `daily_logs` — one per project per day (0004 + 0024 + 0027)
- `log_entries` — paving/milling/tack events per log (0004 + 0028 + 0037)
- `loads` — per-load ticket records (0020 + 0026 + 0030)
- `load_rejections` — rejected loads (0021)
- `truck_queue` — trucks en-route ETA tracker (0022)
- `density_readings` — nuclear gauge readings (0023)
- `photo_attachments` — geotagged field photos (0011)
- `crew_locations` — live crew GPS pings (0032)

### External Data
- `dot_road_segments` — multi-state DOT road data (0042)
- `dot_sync_log` — DOT import sync history (0042)

### Equipment / Calculators
- `calculations` — calculator run history (0001)
- `job_site_equipment` — equipment roster (0003)

---

## Proposed Consolidated Schema

The 61 migrations can be collapsed to a single `0001_consolidated.sql` for greenfield deployments. Key decisions:

1. **Final role CHECK** (from 0039):
   `('owner','admin','member','foreman','operator','inspector','office','laborer','screed_man')`

2. **Fix 0060 FK bug**: `REFERENCES organizations(id)` not `orgs(id)`.

3. **Drop 0029 placeholder**: just omit the `SELECT 1;` — the `closed_at` column is present in the consolidated `daily_logs` CREATE.

4. **Merge 0033+0034**: use the corrected `work_zones` with `job_site_id TEXT` from the start.

5. **Omit historical rebuild migrations** (0010, 0019, 0039): use the final CHECK directly in the initial CREATE TABLE.

6. **Omit trigger-only migrations** (0038, 0039 trigger sections): create triggers in the same DDL block as their tables.

The consolidated file is NOT included here to avoid any confusion with the live migration sequence — do not apply it to any environment that has already run the 61 migrations. It is for fresh environments only.

---

## Migration Health: Forward-Compat Assessment

| Category | Verdict |
|---|---|
| Duplicate numbers | NONE — all 61 are unique |
| Missing numbers | NONE — sequential 0001–0061 |
| Nested migrations/ folder | NOT PRESENT (may have been cleaned up) |
| Idempotency (IF NOT EXISTS) | Most CREATE TABLE statements use IF NOT EXISTS from 0006 onward; 0001–0005 do not. Safe on first-run but not re-runnable. |
| ALTER TABLE safety | SQLite has no IF NOT EXISTS for ADD COLUMN; each alter is in its own file which is the correct pattern. |
| Data loss risk | 0010, 0019, 0039 do DROP TABLE + RENAME. Data is preserved via INSERT INTO...SELECT * but any column added since the original CREATE must be listed explicitly — these migrations copy all columns present at the time and are safe as-is. |
| Bug: 0060 FK | `orgs(id)` should be `organizations(id)` — needs a fix migration if FK enforcement is enabled |
| Bug: 0033 INTEGER type | Fixed by 0034 — harmless after 0034 is applied |

---

## Recommended Next Steps (not done in this PR)

1. **Fix 0060 FK**: add `0062_fix_notification_schedules_fk.sql` that recreates `notification_schedules` with the correct FK `organizations(id)`.
2. **Retire 0029**: it is a permanent no-op; add a comment in the README noting this is intentional.
3. **Write consolidated schema**: produce `docs/consolidated-schema.sql` (not a migration) for documentation and fresh-install testing.
4. **Add README table-of-contents** to `migrations/README.md` mapping each migration to its purpose (this audit doc serves that purpose for now).
5. **CI check**: the deploy workflow already checks for duplicate numbers; no additional CI changes needed.

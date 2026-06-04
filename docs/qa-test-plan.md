# PaveRate QA Test Plan — Role-Based User Personas

> Version: 1.0  
> Branch: feat/auth-and-data  
> Last updated: 2026-06-04

This document defines the user personas, primary workflows, expected UI state, and test
scenarios for each org role in PaveRate. Tests are organized by role, then by workflow
area. Security boundaries are server-enforced (`requireOrgRole`) regardless of view
tier — this plan tests both UX routing AND the underlying API guards.

---

## Role Overview

| Role | View Tier | Default Route | DB column |
|------|-----------|---------------|-----------|
| `owner` | full | `/dashboard` | `org_members.role` |
| `admin` | full | `/dashboard` | `org_members.role` |
| `foreman` | full | `/dashboard` | `org_members.role` |
| `member` | full | `/dashboard` | `org_members.role` (legacy fallback) |
| `laborer` | field | `/app/field` | `org_members.role` |
| `operator` | field | `/app/field` | `org_members.role` |
| `screed_man` | screed | `/app` | `org_members.role` |
| `inspector` | office | `/dashboard` | `org_members.role` |
| `office` | office | `/dashboard` | `org_members.role` |

---

## Dev Environment Test Accounts

All credentials below are for the local dev environment only (`localhost:5173` via
`npm run dev`). The dev seed endpoint (`POST /api/dev/seed`) creates these accounts
automatically when the app runs in development mode (`dev === true`).

| Role | Email | Password | Org |
|------|-------|----------|-----|
| owner | owner@dev.paverate.com | devpass1 | Dev Paving Co. |
| admin | admin@dev.paverate.com | devpass1 | Dev Paving Co. |
| foreman | foreman@dev.paverate.com | devpass1 | Dev Paving Co. |
| laborer | laborer@dev.paverate.com | devpass1 | Dev Paving Co. |
| operator | operator@dev.paverate.com | devpass1 | Dev Paving Co. |
| screed_man | screed@dev.paverate.com | devpass1 | Dev Paving Co. |
| inspector | inspector@dev.paverate.com | devpass1 | Dev Paving Co. |
| office | office@dev.paverate.com | devpass1 | Dev Paving Co. |

> Note: Dev seeding is gated behind SvelteKit's `dev` flag and the `/api/dev/seed`
> endpoint. It will not run in production. The seed script populates a job site with
> active paving log, several loads, and density readings so role-specific views have data.

---

## 1. Owner / Admin

### Persona
The org account holder (owner) or an invited admin. Manages the full org: team, job
sites, billing settings, and has visibility into all reporting. Typically uses a
tablet or laptop in the office/trailer, sometimes a phone in the field.

### Primary Workflows
1. Create and configure job sites (project setup, contract values, crew assignment)
2. Invite crew members and assign roles
3. Monitor daily paving progress across all active job sites
4. Review tonnage, spread rate, and density reports
5. Export daily logs for DOT submittal or owner billing
6. Update org settings (name, logo, default mix/thickness values)

### Expected UI — Visible
- `/dashboard` with job-site overview cards, daily summary stats, map panel
- `/dashboard/job-sites/[id]` full project tabs: Overview, Log, Map, Crew, Config
- `/dashboard/team` — member roster, role editor, invite flow
- `/dashboard/settings` — org settings, logo upload, default values
- `/dashboard/activity` — audit log
- `/dashboard/map` — fleet / crew location map
- `/app` — Quick Calc workspace (all calculator tools)
- Nav sidebar: Dashboard, Job Sites, Team, Settings, App/Calc links
- Owner/Admin only: `/dashboard/admin/*` reports (activity, crew productivity)

### Expected UI — Hidden or Simplified
- No field-only view (load tap counter, simple distance) — they use the full log
- No screed-only restricted view

### Test Scenarios

**TC-OA-01: Post-login redirect**
- Log in as `owner@dev.paverate.com`
- Assert: redirected to `/dashboard` (not `/app` or `/app/field`)

**TC-OA-02: Dashboard data visibility**
- Navigate to `/dashboard`
- Assert: at least one job-site card is visible with tonnage / progress data
- Assert: map panel renders without error

**TC-OA-03: Job site full access**
- Navigate to `/dashboard/job-sites/[id]`
- Assert: all tabs (Overview, Log, Map, Crew, Config) are present and clickable
- Assert: Edit buttons on Config tab respond

**TC-OA-04: Team management**
- Navigate to `/dashboard/team`
- Assert: member list shows all seeded members with role badges
- Assert: Invite Member button is visible and opens invite modal
- Assert: Role dropdown on an existing member changes and saves

**TC-OA-05: Org settings**
- Navigate to `/dashboard/settings`
- Assert: org name field is editable
- Assert: logo upload control is visible and accepts PNG/JPG
- Assert: default lift thickness / mix type fields are present

**TC-OA-06: Admin reports**
- Navigate to `/dashboard/admin` (owner or admin only)
- Assert: page loads without 403
- Assert: crew-productivity data visible

**TC-OA-07: API guard — non-owner cannot access admin**
- Log in as `foreman@dev.paverate.com`
- Navigate directly to `/dashboard/admin`
- Assert: 403 or redirect to `/dashboard`

**TC-OA-08: Quick Calc accessible**
- As owner, navigate to `/app`
- Assert: full calculator workspace with tool picker sidebar renders
- Assert: all calculator cards (SpreadRate, Tack, Tonnage, StickCheck, etc.) are reachable

### Common Pain Points to Test
- Role editor in `/dashboard/team` must persist on save; page refresh should show updated role
- Org logo upload: file size limit error messaging, R2 upload progress
- Invite email delivery — check `/admin/emails` for delivery status
- Job site config changes should propagate to `calcContext` on next field login

---

## 2. Foreman

### Persona
Crew foreman. Manages one or more active job sites day-to-day. Logs loads, opens/closes
the daily paving log, tracks tonnage and distance. Uses phone in the field, sometimes a
tablet. Technically included in the `full` view tier — same routes as owner/admin but
without admin-report access.

### Primary Workflows
1. Open the daily paving log for the active job site each morning
2. Record truck loads as they arrive (ticket number, tons, timestamp)
3. Track distance paved and check live spread rate
4. Log density readings at end of each pass
5. Close the day's log with an EOD summary
6. Use Quick Calc for spot calculations (spread rate, tack coverage, stick check)

### Expected UI — Visible
- `/dashboard` — job-site cards, daily summary
- `/dashboard/job-sites/[id]/log` — today's log (open/close, loads, density)
- `/app` — Quick Calc (all tools available)
- Nav: Dashboard, Job Sites, App links
- Load-entry form (ticket #, tons, auto-timestamp)
- EOD summary / close-log control

### Expected UI — Hidden or Simplified
- No Team invite flow (foreman cannot invite or change roles)
- No org-level Settings tab
- No admin reports
- No `/dashboard/admin/*` routes

### Test Scenarios

**TC-FO-01: Post-login redirect**
- Log in as `foreman@dev.paverate.com`
- Assert: redirected to `/dashboard`

**TC-FO-02: Open daily log**
- Navigate to `/dashboard/job-sites/[id]/log`
- Assert: "Open Log" button visible if log not yet open
- Assert: clicking Open Log changes status to active

**TC-FO-03: Log a load**
- With an open log, submit a load (ticket: T-001, tons: 18.5)
- Assert: load appears in the loads table with correct timestamp
- Assert: cumulative tonnage counter increments

**TC-FO-04: Density entry**
- In an open log, enter a density reading (pass, station, reading, target)
- Assert: reading saved and listed in density section
- Assert: compliance badge (green/amber/red) reflects spec threshold

**TC-FO-05: Close daily log (EOD)**
- Click Close Log / EOD button
- Assert: confirmation dialog or summary shown
- Assert: log transitions to closed state; date/time recorded

**TC-FO-06: Quick Calc access**
- Navigate to `/app`
- Assert: full tool picker sidebar is visible
- Assert: all calculator cards available (foreman uses calc on tablet in the field)

**TC-FO-07: Cannot access admin report**
- Navigate directly to `/dashboard/admin`
- Assert: 403 response or redirect

**TC-FO-08: Cannot change org settings**
- Navigate to `/dashboard/settings`
- Assert: either 403 redirect OR settings page renders but save is blocked server-side
- Confirm: `PATCH /api/org/settings` as foreman returns 403

### Common Pain Points to Test
- Load-entry form: tons field should default to last-used value (e.g. 18.5 tons)
- Auto-timestamp should use device local time, not server UTC
- Log open/close buttons must not be double-tappable (debounce or loading state)
- EOD flow: if no loads logged, warn but still allow close

---

## 3. Laborer / Operator

### Persona
General crew member or equipment operator. Does not manage the project — their only
job in the app is to log a truck load when they're responsible for receiving/counting,
or to check their daily distance progress. Uses a phone with dirty/gloved hands.
Minimal UI, maximum touch target size.

### Primary Workflows
1. Tap to log a truck load (tons auto-filled, ticket number optional)
2. View distance paved today vs. target
3. View simple tonnage total for the day

### Expected UI — Visible
- `/app/field` — load tap counter, distance display, tonnage badge
- Job site name and status badge at top
- Single "Add Load" button (large, 48px+)
- Daily total display (tons logged, footage complete)
- Log Distance form (feet, simple input)

### Expected UI — Hidden or Simplified
- No `/dashboard` routes
- No job-site config, team management, or org settings
- No full calculator workspace
- No nav sidebar (or minimal with only Field and logout)
- No density entry (that is the foreman/inspector's job)
- No EOD controls

### Test Scenarios

**TC-LO-01: Post-login redirect to field**
- Log in as `laborer@dev.paverate.com`
- Assert: redirected to `/app/field` (not `/dashboard` or `/app`)

**TC-LO-02: Field view renders**
- On `/app/field`, assert: job site selector is visible with at least one option
- Assert: Add Load button is prominent (visually dominant, >= 48px touch target)
- Assert: daily tonnage display shows running total

**TC-LO-03: Log a load**
- Tap Add Load; confirm default tons shown (18.5 or last-used)
- Submit; assert: counter increments immediately (optimistic update or fast reload)

**TC-LO-04: Log distance**
- Enter footage in distance field and submit
- Assert: footage display updates

**TC-LO-05: Dashboard blocked**
- Navigate directly to `/dashboard`
- Assert: redirect to `/app/field` (layout guard redirects field-tier roles)

**TC-LO-06: API guard — cannot POST to org-admin endpoints**
- As laborer, attempt `POST /api/org/settings` (via DevTools or curl)
- Assert: 403 response

**TC-LO-07: Operator identical to laborer**
- Repeat TC-LO-01 through TC-LO-06 with `operator@dev.paverate.com`
- Assert: identical behavior

### Common Pain Points to Test
- Job site auto-select: if laborer is assigned to exactly one active site, pre-select it
- Touch targets: Add Load button must be >= 48px height on 375px viewport
- Offline behavior: load entry should queue if offline and sync when connectivity returns
- Back button from `/app/field` should not navigate to `/dashboard`

---

## 4. Screed Man

### Persona
Screed operator. Highly specialized role: needs live spread rate, stick check, and
batch check tools and nothing else. Works during active paving, phone mounted or in a
pocket, checks numbers between passes.

### Primary Workflows
1. Check live spread rate vs. target (quick glance, big number)
2. Run a stick check (measure loose height, get compacted estimate)
3. Run a batch spread-rate check (compare two passes)
4. Check feet remaining for today

### Expected UI — Visible
- `/app` — renders `ScreedManView` (role-conditional render in `/app/+page.svelte`)
- SpreadRateCard
- BatchSpreadRateCheck card
- StickCheckCard
- FeetLeftCard

### Expected UI — Hidden or Simplified
- No tool picker sidebar (full calculator list)
- No JobBar (job context selector)
- No Live Rates chart panel
- No dashboard navigation
- No team / settings / admin routes

### Test Scenarios

**TC-SM-01: Post-login redirect to /app**
- Log in as `screed@dev.paverate.com`
- Assert: redirected to `/app` (not `/dashboard` or `/app/field`)

**TC-SM-02: ScreedManView renders**
- On `/app`, assert: `ScreedManView` component is shown (not the full tool-picker workspace)
- Assert: SpreadRateCard, StickCheckCard, FeetLeftCard, BatchSpreadRateCheck are all visible
- Assert: tool picker sidebar is NOT present

**TC-SM-03: Dashboard blocked**
- Navigate to `/dashboard` directly
- Assert: redirect to `/app` (or 403 if server guard is in place)

**TC-SM-04: Spread rate card functional**
- Enter tonnage, road width, lift thickness
- Assert: spread rate result updates
- Assert: out-of-spec value triggers amber/red status badge

**TC-SM-05: Stick check functional**
- Enter loose height measurement
- Assert: compacted estimate computed and displayed with spec tolerance

**TC-SM-06: isScreedMan derivation**
- (Code-level check) In `/app/+page.svelte`, confirm `isScreedMan` is derived from
  `authStore.org?.role === 'screed_man'` and not from a hardcoded role list

### Common Pain Points to Test
- `ScreedManView` should show even if user is offline (all calcs are client-side)
- Numbers must be large enough to read in bright sunlight
- Role prop must not shadow `$state` rune — component prop is named `data` not `state`
- Switching back to full view requires an admin to change the role in `/dashboard/team`

---

## 5. Inspector

### Persona
QA/materials inspector. Focused on density readings and compliance. Does not pave;
arrives to check core densities or nuclear gauge readings and records them against
GDOT spec targets. Needs to navigate to the active job site log.

### Primary Workflows
1. Navigate to the active job site log
2. Record density readings (pass, station, reading value)
3. Check compliance badge (in-spec vs. out-of-spec vs. retest)
4. Review spec alerts for temperature or compaction thresholds
5. Possibly review prior-day readings for trend analysis

### Expected UI — Visible
- `/dashboard` — job-site cards (read navigation to find active site)
- `/dashboard/job-sites/[id]/log` — density entry section, spec compliance gauges
- Compliance badges (green/amber/red per GDOT threshold)
- Spec alert banners (temperature minimums, Interstate emulsion ban, etc.)

### Expected UI — Hidden or Simplified
- No load-entry controls (inspector does not log truck loads)
- No org settings or team management
- No admin reports
- No invite flow
- No Quick Calc tool picker (inspector does not set spread rates)
- No job-site config/edit controls (read-only navigation only)

### Test Scenarios

**TC-IN-01: Post-login redirect**
- Log in as `inspector@dev.paverate.com`
- Assert: redirected to `/dashboard` (inspector is `office` view tier)

**TC-IN-02: Navigate to active log**
- From `/dashboard`, click active job-site card
- Navigate to the Log tab
- Assert: density entry section is visible
- Assert: tonnage / load section is NOT editable (or hidden) — inspector cannot log loads

**TC-IN-03: Log a density reading**
- Enter density reading (pass, station, reading value, target)
- Assert: reading saved successfully
- Assert: compliance badge appears (green if within spec, amber/red if out)

**TC-IN-04: Spec compliance gauges**
- With a seeded density reading below GDOT minimum (e.g. 91% for Surface)
- Assert: red badge and retest indicator appear
- Assert: in-spec reading shows green badge

**TC-IN-05: Read-only job site config**
- Navigate to the Config tab of a job site
- Assert: edit controls are either absent or disabled (inspector cannot reconfigure a project)

**TC-IN-06: Cannot log a load via API**
- As inspector, attempt `POST /api/job-sites/[id]/log/loads`
- Assert: 403 response

**TC-IN-07: Org settings blocked**
- Navigate to `/dashboard/settings`
- Assert: 403 or redirect

### Common Pain Points to Test
- Density entry: reading value should have numeric keyboard on mobile
- Spec thresholds must come from `paverate.yaml` constants (no magic numbers)
- Out-of-spec readings should be visually prominent — red, not just a small badge
- Inspector may arrive on-site without connectivity — density entry should queue offline

---

## 6. Office

### Persona
Office staff, project manager, or billing coordinator. Needs project status, tonnage
summaries, contract values, and report exports. Not in the field — uses desktop or
laptop. May export daily logs for DOT submittal or owner billing.

### Primary Workflows
1. Review active job-site status across all sites
2. Export daily tonnage reports (PDF or CSV)
3. Check contract value vs. tonnage delivered (progress billing)
4. Review scheduling for upcoming paving days
5. Check crew productivity summary

### Expected UI — Visible
- `/dashboard` — all job-site cards with status, tonnage progress
- `/dashboard/job-sites/[id]` — project overview (read), logs summary, contract value
- Export controls (PDF/CSV) on log and report pages
- Scheduling views (when built)
- `/dashboard/activity` — audit log
- Crew productivity reports (when the admin report feature is visible to `office` tier)

### Expected UI — Hidden or Simplified
- No field-level load-entry form
- No density entry
- No Quick Calc tool picker (office does not operate in the field)
- No direct paving log edit (open/close log — that is the foreman's job)
- No team management or invite flow (unless explicitly granted)
- No org-level settings (read-only at most)

### Test Scenarios

**TC-OF-01: Post-login redirect**
- Log in as `office@dev.paverate.com`
- Assert: redirected to `/dashboard`

**TC-OF-02: Dashboard read access**
- Assert: job-site cards load with tonnage, status, and date info
- Assert: clicking a card navigates to the job-site detail

**TC-OF-03: Export daily log**
- Navigate to a closed daily log
- Assert: Export button (PDF or CSV) is visible
- Click export and assert: file download initiates or print dialog opens

**TC-OF-04: Contract value visibility**
- Navigate to job-site Overview tab
- Assert: contract value, tons contracted, tons delivered, and % progress are visible

**TC-OF-05: Cannot open/close paving log**
- Navigate to `/dashboard/job-sites/[id]/log`
- Assert: Open Log / Close Log buttons are absent or disabled for the `office` role
- Confirm: `POST /api/job-sites/[id]/log/open` as `office` returns 403

**TC-OF-06: Cannot edit job-site config**
- Navigate to Config tab
- Assert: edit controls are absent or disabled

**TC-OF-07: Scheduling view**
- Navigate to `/dashboard/schedule` (when built)
- Assert: calendar/schedule renders without error

**TC-OF-08: Org settings blocked**
- Navigate to `/dashboard/settings`
- Assert: 403 or redirect (office cannot change org defaults)

### Common Pain Points to Test
- Export formats: CSV must have correct column headers for DOT submittal templates
- Contract value: changing the value must be restricted to owner/admin
- Pagination on logs list: 50+ loads should paginate cleanly
- Long job-site names must not overflow cards on mobile

---

## 7. Cross-Role Regression Tests

These tests exercise the auth boundary regardless of UI routing.

**TC-XR-01: Role change takes effect on next page load**
- Log in as `laborer`; verify redirect to `/app/field`
- Admin changes laborer to `foreman` in `/dashboard/team`
- User refreshes; assert: redirected to `/dashboard` on next load

**TC-XR-02: Unauthenticated user cannot reach protected routes**
- Without logging in, navigate to `/dashboard`
- Assert: redirect to `/login`

**TC-XR-03: Unauthenticated user CAN use Quick Calc**
- Without logging in, navigate to `/app`
- Assert: calculator workspace renders without login prompt
- Assert: all calculator cards function offline

**TC-XR-04: Token expiry / logout**
- Log in, then manually expire the session cookie
- Attempt a protected API call
- Assert: 401 response and redirect to `/login`

**TC-XR-05: Multi-org isolation**
- (If seeded) User is member of Org A; attempt to access Org B job-site via direct URL
- Assert: 403 (org isolation enforced server-side)

**TC-XR-06: Mobile viewport (375px) touch targets**
- Open DevTools, set viewport to 375px wide
- Navigate as each role to their primary landing page
- Assert: all buttons and interactive elements are >= 48px height
- Assert: no horizontal scroll bar appears

**TC-XR-07: Offline PWA behavior**
- Install app to home screen (iOS Safari or Chrome Android)
- Disable network
- Assert: `/app` (Quick Calc) loads and calculates without error
- Assert: field worker load entry queues offline and shows "pending sync" indicator

---

## 8. Test Execution Checklist

Before each release cut from `feat/auth-and-data`:

- [ ] TC-OA-01 through TC-OA-08 (Owner/Admin)
- [ ] TC-FO-01 through TC-FO-08 (Foreman)
- [ ] TC-LO-01 through TC-LO-07 (Laborer/Operator)
- [ ] TC-SM-01 through TC-SM-06 (Screed Man)
- [ ] TC-IN-01 through TC-IN-07 (Inspector)
- [ ] TC-OF-01 through TC-OF-08 (Office)
- [ ] TC-XR-01 through TC-XR-07 (Cross-role regression)
- [ ] Build passes: `timeout 90 node node_modules/vite/bin/vite.js build`
- [ ] No TypeScript errors in `src/`
- [ ] Mobile viewport check at 375px for each role's primary page
- [ ] PWA install and offline calc test on real device or BrowserStack

---

## 9. Known Gaps (Future Work)

| Gap | Notes |
|-----|-------|
| `/app/field` offline sync | Load entry queues in localStorage; sync on reconnect not yet implemented |
| Inspector density entry offline | Should queue same as load entry |
| Scheduling views | `/dashboard/schedule` not yet built |
| Office export | PDF/CSV export buttons partially implemented |
| Automated E2E suite | Playwright tests targeting each persona's critical path |
| BrowserStack device matrix | Real device tests (iOS 15, Android Chrome 90+) |

---

*Maintained by the PaveRate dev team. Update this file when roles, routes, or API guards change.*

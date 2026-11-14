# PaveRate status

**As of November 13, 2026.** This replaces the June 1–2 backlog, kanban, and
site-review notes. Those files are stubs on purpose. Git history still has them.

## Where the product is

| | |
|---|---|
| Product branch | `feat/auth-and-data` (about 860 commits ahead of `main`) |
| `main` | June 1, 2026 calculator (`075b578`). GitHub default branch. |
| Production site | [paverate.com](https://paverate.com) still serves that calculator. Probed November 13, 2026: title “Paverate”, tagline “In-field asphalt paving calculators”, `/login` returns 404. |
| Preview site | [dev.paverate.com](https://dev.paverate.com) serves the project app. Same probe: title “Paverate — Run paving projects from the field”, `/login` is a sign-in page. Which git branch that preview tracks was not read from the Cloudflare API. |
| Deploy workflow | `.github/workflows/deploy.yml` runs on **push to `main` only**. It applies remote D1 migrations, builds, and `wrangler pages deploy` to project `paverate`. |

Do not merge `feat/auth-and-data` into `main`, and do not change the Pages
production branch, until the checklist below is done on purpose. A merge to
`main` deploys paverate.com and migrates the one shared D1 database.

## What the app is now

Signed-out field calculators still work (`/app`), including offline PWA use.
Signed-in use adds orgs and roles, the project workspace, in-project calculators
on the Production tab, daily logs, per-load tickets, equipment, mix and materials
libraries, roads-only MapLibre maps, GDOT/contract PDF import (Bedrock primary,
Workers AI fallback), and the `/admin` console.

Auth, orgs, and the dashboard are implemented. Older docs that call them
“planned” are wrong.

## Health check (this pass)

Node v22.23.4, clean `npm ci`.

- `npx wrangler types` then `svelte-check`: 0 errors, 0 warnings. Before types
  are generated, tsc warns that gitignored `worker-configuration.d.ts` is
  missing. CI generates it before the check. That warning is not a product bug.
- Vitest unit, integration, and component projects: 51 files, 1435 tests, all
  passing. That includes the new Production-tab calculator open test. The same
  three projects on `72a7a64` before this branch were 50 files / 1433 tests,
  also passing.
- `npm run build` (`wrangler types && vite build`, no `--check`) completed.
  Workbox logged that `prerendered/**` matches nothing. Expected: this app does
  not prerender `/`, and `navigateFallback` stays null for that reason.
- `npx wrangler d1 migrations apply paverate-db --local` applied every file
  through `0080`, including both `0071_*` files and both `0074_*` files.
  Wrangler accepts the duplicate numbers. The GitHub deploy workflow does not
  (see below).
- A browser pass of the project page was not completed here. `vite dev` sends
  the first request through Wrangler's remote AI session ("Establishing remote
  connection...") and this environment has no `CLOUDFLARE_API_TOKEN`, so
  `/api/auth/dev-login` never returned. The Calculators open/close behavior is
  covered by `ProjectCalculatorsOpen.test.ts` instead. Playwright's existing
  suite was not run; it starts the same `vite dev` and has a 60 second timeout
  that already fails in CI for that startup, not for a single assertion.

## Unmerged June branches

24 remote branches are not contained in `feat/auth-and-data`. None were deleted.

Their unique commits were compared file-by-file with the current tree. The
tests, mix library, materials API, route-geometry fallback, audit logging, and
role routing they added are already on `feat/auth-and-data`, usually in a later
form. Cherry-picking those commits would roll newer files backward.

Examples already present, so skipped:

- Org, daily-log, loads, calculations, rate-limit, normalise, LoadTracker, and NumberField tests (`t_2afae13e`, `t_73f8529a`, `t_d1b5105b`, `t_72ef75f3`, `t_ef311d15`, `t_9fafb87d`, `t_96aa3a5a`, `t_ca679941`)
- E2E job-site spec (`t_23257bd5`) — identical
- Materials API (`t_07713658`) and mix library UI (`t_bd218350`) — current files are newer
- GDOT → OSRM → Overpass geometry (`t_1789a13f`) — current `gdot-geometry.ts` is the longer chain
- Admin audit log on login (`t_7c81ff1d`) — `logAuditEvent` already records IP and user agent
- Role routing (`t_9ae7f1d0`, `t_db2254ad`) — `src/lib/server/role-views.ts` is the later version. The branch-only `src/lib/utils/role-routing.ts` still sent field users to `/app` because `/app/field` did not exist yet
- `db-auth` split, calc engine extract, histogram rename, field load view, dashboard redesign (`t_26ba243c`, `t_4e2f33b9`, `t_2bbdde0b`, `t_aaae9707`, `t_2aa1e976`, `t_2a8561f5`) — superseded by later refactors
- PDF and email design docs (`t_e7f84f13`, `t_ec99ca49`) — identical to the copies already in `docs/`
- Offline banner — already mounted in the root layout

Ported: `ErrorBoundary`. It was added, then deleted on June 4 as unused
(`f68eaf4`) before `feat/errorboundary-apirequest-t_eb439703` could land. That
branch never wrapped the boundary either; it switched pages to `apiRequest`
(already the pattern) and added the offline banner. The component is restored
and wraps the page tree. Toasts stay outside it so an error does not remove them.

Draft PR [#11](https://github.com/dylanl321/paving-calculator/pull/11) (phone
app prompt, branch `cursor/phone-app-prompt-d9bd`) targets `main`. Left open and
unmerged. Retarget it after `main` is current, or close it. Merging it first
only edits the old calculator README.

## Promoting `feat/auth-and-data` to `main`

This environment could not call the Cloudflare API (`CLOUDFLARE_API_TOKEN` is
unset), so remote migration state was **not** re-listed. Check it before merging.

1. **See what D1 already has.** One database, `paverate-db`
   (`database_id` `aead16ae-73b7-4508-8423-4c7c290cfcf5` in `wrangler.jsonc`).
   Preview and production share it. There is no second “dev D1”.
   ```bash
   npx wrangler d1 migrations list paverate-db --remote
   ```
   `deploy.yml` will run `npx wrangler d1 migrations apply paverate-db --remote`
   on the push to `main`. If dev.paverate.com has been using this database,
   most of `migrations/0001`–`0080` may already be applied. Confirm; do not
   assume.

2. **Fix the duplicate-number gate before that push.** The deploy workflow
   exits 1 when two files share a numeric prefix. These pairs fail it today:
   - `0071_document_feedback.sql` and `0071_preferred_units.sql`
   - `0074_gdot_construction_projects.sql` and `0074_org_materials_tack.sql`

   `0065` is missing (warning only). Do not rename a file that is already in
   remote `d1_migrations`; wrangler would treat the new name as unapplied.
   Safer options: teach the duplicate check to allow these four historical
   names, or rename only the file the remote list says was never applied.

3. **Pages secrets, production and preview.** Vars already in `wrangler.jsonc`
   (`SUPER_ADMIN_EMAILS`, `BEDROCK_REGION`, `BEDROCK_MODEL`, `BEDROCK_MAX_TOKENS`)
   ship with the worker. Secrets do not. Set them with
   `npx wrangler pages secret put …` and redeploy afterward:
   - `AWS_BEARER_TOKEN_BEDROCK` — long-term Bedrock key (alias `BEDROCK_API_KEY`). Short-term keys need SigV4, which this worker does not do. Without it, PDF import uses Workers AI only.
   - `RESEND_API_KEY` — invites, password reset, report mail. Missing key skips send.
   - `CRON_SECRET` — `/api/cron/*` accepts unauthenticated calls when this is unset.
   - GitHub Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (the deploy job).

   Bindings the Pages project needs: D1 `DB`, R2 `ASSETS_BUCKET`
   (`paverate-org-assets`), Workers AI `AI`. Node 22. Build command stays
   `npm run build` (`wrangler types && vite build`, no `--check`). Output
   directory `.svelte-kit/cloudflare`. Project name in the workflow is `paverate`.

4. **Merge `feat/auth-and-data` into `main` only after 1–3.** That push is the
   production deploy. Smoke-test paverate.com login, a project page, and a
   calculator after it. Keep `dev.paverate.com` in mind: it shares the database,
   so a migration applied at production time is live for both hostnames.

5. **Close or retarget PR #11** so it cannot land on the old README.

## Project workspace pass (November 13, 2026)

Fixed on `cursor/project-management-fixes-15a9`:

- Saving a project configuration now writes `num_lifts`, `total_tonnage`,
  `cost_per_ton`, `cost_per_sy`, `cost_per_mile`, and `total_contract_value`.
  A later partial save does not clear them. PDF import was already sending
  those values; they were dropped on the way into D1. A read-time mix overlay
  no longer replaces a saved tonnage before the next save.
- Plan → Project details edits name, customer, job number, project manager,
  work type, contract amount, and start/completion dates. Those dates are what
  milestone suggestions use. Schedule dates are calendar dates, not UTC-shifted.
- Owners and admins can create crews and add people on Team, then assign a
  crew on the project Resources tab. Foremen and laborers only see projects
  their crew is on, so this was a blocked field workflow.
- Crew reads, deletes, member assignment, and project assignment now require
  the crew to belong to the caller’s organization.
- Laborers, operators, inspectors, and screed operators can no longer change
  project identity or paving configuration. They can still log production.
- Onboarding stores road length on the project config and org defaults in
  settings. The invite-code box that did nothing is gone. Dead
  `/dashboard/job-sites` links point at `/dashboard/projects`.

## Access, orgs, and field documents (same day, follow-up)

- Field roles (`foreman`, `laborer`, `operator`, `screed_man`) can open a
  project by id only when their crew is assigned to it. The check runs in
  the request hook for every `/api/job-sites/:id/*` route and in the project
  page server load (the page, today's log, and log history). Owner, admin,
  member, office, and inspector still see the whole organization.
- `getOrgByUserId` prefers `users.active_org_id` (migration `0081`), then the
  most recently accepted membership. A switcher appears in the sidebar when
  a person belongs to more than one org.
- Records → Field documents reviews a weight ticket, material certification,
  or daily report and saves only after confirm. Tickets become loads. Certs
  become an org material plus a project document row. Daily reports become
  that day's log and a paving entry.
- The in-project calculator panel now includes the soil, concrete, grading,
  and specialty calculators that already exist. Tack is still its own tool
  in the asphalt group. There is no milling calculator component to mount.
- Projects can download a CSV of loads and daily log entries.
- Local `vite dev` sets `platformProxy.remoteBindings` to false so the AI
  binding does not open a remote Wrangler session. Apply `0081` locally
  before using the org switcher (`npx wrangler d1 migrations apply paverate-db --local`).

## Production, schedule, reports, notices (stacked follow-up)

- Each project Command tab shows tons placed vs planned, miles paved vs total,
  yield vs target spread rate, and days remaining. Pace is ahead, on schedule,
  or behind when the gap is at least 5 points. Rain days are removed from the
  elapsed schedule so a weather day is not a missed production day.
- The dashboard shows the same pace across active projects for owners and
  office. Operators and screed operators now get the crew-scoped portfolio,
  matching project access.
- Plan → Schedule lists crew date windows, overlap conflicts, and logged rain
  days. Owners and admins can set a crew's start and end on the project
  (migration `0082`). Assignments with no dates are not treated as conflicts.
  A field role only sees the other project's name and dates when their crew
  can open that project. Otherwise the conflict says "Another project".
- `/dashboard/job-sites/[id]/report` is a printable project summary (browser
  Print / Save as PDF) plus the latest daily log. CSV export is unchanged.
- Notification routing covers daily log submitted, low tonnage remaining
  (10% or less, once per project), a field document waiting for review (once
  per kind per day), and crew assigned (crew members only). Missing
  preferences count as on. Delivery does not call Resend; `quietSender` is
  the handler default and tests pass a mock sender. Dispatches are stored in
  `notification_dispatches` so they are not repeated.
- Scanned field documents that the label parser cannot use may be completed
  by Workers AI when the `AI` binding is present. A model error keeps the
  labeled result. Tests mock the completer and do not call the network.
- Checked the main routes at 390px and 1280px locally (overflow, unlabeled
  controls, the new pace, schedule, report, and notification controls).

## Field workflow pass

- The field load form no longer starts at 18.5 tons. Submit stays disabled until a positive tonnage is entered, and "today" uses the local calendar date.
- Calculations for a job follow the same crew rule as opening the project.
- A daily log entry, edit, or delete whose log belongs to a different project than the URL is rejected. Negative tons are rejected before they hit the database.
- The org pace list loads projects together instead of one after another.
- The field empty state says the crew has no assigned project.

## Still open

- Duplicate migration prefixes `0071` and `0074` still fail `deploy.yml`.
  Do not rename a file that remote D1 has already applied. See the promote
  checklist above.
- Migrations `0081_active_org.sql` and `0082_schedule_and_notices.sql` are new.
  They were applied only to local D1 here. List remote migrations before any
  push to `main`.
- Operational notices are recorded and routed, and they are not emailed.
  Turning on Resend for those four events is a delivery choice, separate from
  the existing end-of-day cron, which still sends when `RESEND_API_KEY` is set.
- `job_site_assignments` (foreman / operator / inspector rows) still have an
  API. The project page shows them when they exist and does not create new
  ones. Crew membership is the roster that controls who sees the job.
- Field-document extraction is label-based (Net Tons, Mix, Date, and so on).
  A scanned ticket with no text still needs the existing ticket OCR path;
  this review form does not call Workers AI.
- There is still no milling calculator component. Milling stays a daily-log
  entry type.
- `BACKEND_SETUP.md` still describes the first migration and three roles.
  Trust `migrations/` and the route tree instead.
- Playwright’s 60 second `vite dev` startup is still the E2E gap in CI.
  This environment has no `CLOUDFLARE_API_TOKEN`, so a browser pass of the
  signed-in project page was not completed here. The API behavior above is
  covered by Vitest.

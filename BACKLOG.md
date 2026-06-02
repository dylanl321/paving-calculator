# PaveRate — Complete Feature & Task Backlog

**Created:** June 2, 2026  
**Repo:** `dylanl321/paving-calculator`  
**Branch:** `feat/auth-and-data`  
**Target:** Professional mobile-first SaaS for asphalt paving operations

---

## Overview

This is the complete backlog combining all 50 audit findings, user-requested features, and additional features needed to make PaveRate a mature, professional SaaS product. Tasks are organized into epics with parent/child relationships.

---

## EPIC 1: Critical Bug Fixes

> Already on kanban board. Foundation must be solid before anything else.

| ID | Task | Status |
|----|------|--------|
| 1.1 | Fix Job Site creation API (silent failure) | 🟢 on board |
| 1.2 | Fix Settings route (redirects to dashboard) | 🟢 on board |
| 1.3 | Fix Daily Log "+ Add Entry" button (does nothing) | 🟢 on board |
| 1.4 | Fix Job Setup auto-close when switching calculators | 🟢 on board |
| 1.5 | Fix Owner self-demote/self-remove guard | 🟢 on board |
| 1.6 | Fix calculator double-click switching (stale state) | NEW |
| 1.7 | Remove `CONST.TRUCK_LOAD` from user-facing help text | NEW |
| 1.8 | Fix custom target field accidental override (add undo/confirm) | NEW |
| 1.9 | Fix "silo" terminology ambiguity (clarify plant vs hopper) | NEW |
| 1.10 | Fix Tack Rate to confirm/display which width is being used | NEW |
| 1.11 | Move Day Conditions to top of daily log (foremen fill first) | NEW |
| 1.12 | Bidirectional sync: calculator logs → "tons placed so far" in Feet Left | NEW |

---

## EPIC 2: Mobile-First Redesign

> Make the app actually usable on a phone with gloves in sunlight.

| ID | Task | Status |
|----|------|--------|
| 2.1 | Increase all touch targets to 48px minimum | 🟢 on board |
| 2.2 | Single-column mobile layout (sidebar → bottom nav or hamburger) | child of 2.1 |
| 2.3 | Sticky "Log to Today" button at bottom on mobile | NEW |
| 2.4 | Replace spinbutton time pickers with native `<input type="time">` | NEW |
| 2.5 | Add spacing between Waste % buttons (8px min gap) | NEW |
| 2.6 | High-contrast mode for direct sunlight (boost yellows, larger fonts) | NEW |
| 2.7 | Team table responsive redesign (card layout on mobile, not table) | NEW |
| 2.8 | Calculator list as swipeable tabs instead of scrollable sidebar | NEW |

---

## EPIC 3: Desktop Redesign & Professional Polish

> Refactor the desktop view to feel like a mature SaaS — not a side project.

| ID | Task |
|----|------|
| 3.1 | **Desktop layout overhaul** — proper information hierarchy, whitespace, grid system. Dashboard should look like Linear/Notion, not a dev prototype |
| 3.2 | **Design system & component library** — consistent spacing tokens, color palette, typography scale, elevation system. Document in Storybook or similar |
| 3.3 | **Professional navigation** — collapsible sidebar with icons+labels, breadcrumbs, command palette (Cmd+K) |
| 3.4 | **Landing page redesign** — marketing-quality homepage at paverate.com (production). Hero section, feature cards, pricing teaser, testimonials area |
| 3.5 | **Loading states & skeleton screens** — replace any blank flashes with proper loading indicators |
| 3.6 | **Empty states with CTAs** — "0 Job Sites" should show illustration + "Create your first job site" button |
| 3.7 | **Consistent iconography** — pick one icon set (Lucide/Phosphor) and use it everywhere |
| 3.8 | **Animation & micro-interactions** — subtle transitions on page changes, button feedback, number counting animations on results |
| 3.9 | **Dark/Light theme polish** — both themes should feel equally professional, not "dark default + broken light" |
| 3.10 | **Print stylesheet** — for when someone prints a report or daily log |

---

## EPIC 4: Visual Feedback & UX Polish

> Already partially on board. Expand to cover all 50 findings.

| ID | Task | Status |
|----|------|--------|
| 4.1 | Toast notification system (success/error/info) | 🟢 on board |
| 4.2 | Job Setup bar visual affordance (chevron, "tap to edit") | 🟢 on board |
| 4.3 | Add "back" navigation / breadcrumbs to confirm active calculator | NEW |
| 4.4 | Move Login button to prominent location (top nav or onboarding CTA) | NEW |
| 4.5 | Empty state guidance on dashboard ("Get started" cards) | NEW |
| 4.6 | Out-of-spec warnings with actionable guidance ("Notify operator — adjust screed/speed") | NEW |
| 4.7 | Clear/Reset button on every calculator (prominent, one-tap) | NEW |
| 4.8 | Confirmation modal before destructive actions (remove team member, delete job site) | NEW |

---

## EPIC 5: Show Your Work — Calculation Transparency

> Actually show the steps of each calculation, not just the answer. Inspectors need this. New hires learn from this.

| ID | Task |
|----|------|
| 5.1 | **Step-by-step calculation breakdown** — expand "How this is figured" into a live, filled-in equation: `Rate = (25 tons - 14 retained) × 2000 ÷ (500 ft × 12 ft ÷ 9) = 33.0 lbs/SY`. Every number highlighted and labeled |
| 5.2 | **Variable source indicators** — each number in the formula shows where it came from (Job Setup? Manual entry? GDOT default?) with color coding |
| 5.3 | **Calculation history log** — last 20 calculations saved with timestamps, shareable |
| 5.4 | **"Show to inspector" mode** — full-screen display of the calculation with all work shown, company branding, job site name, date/time. One tap from any calculator |
| 5.5 | **Formula reference cards** — printable/screenshottable cards showing the formula, variables, and GDOT reference for each calculator |
| 5.6 | **Unit conversion helper** — inline toggle between imperial/metric on any value (tons↔kg, feet↔meters, °F↔°C) |

---

## EPIC 6: DOT Standards Integration

> Deep connection to actual GDOT (and other state DOT) specification documents.

| ID | Task |
|----|------|
| 6.1 | **PDF export with DOT compliance validation** — generate a PDF proving all values are within spec. Show Table 12 tolerances, actual vs allowed, pass/fail per value. Timestamp, GPS coordinates, operator signature line |
| 6.2 | **Embedded DOT table viewer** — view GDOT Table 2 (tack rates), Table 4 (lift temp), Table 5 (mix thickness), Table 12 (spread tolerances) inline without leaving the app |
| 6.3 | **DOT spec linkage per calculator** — each calculator shows exactly which DOT section it references, with a deep link to the PDF or rendered spec page |
| 6.4 | **Multi-state DOT support** — allow switching between GDOT, FDOT, ALDOT, NCDOT, TxDOT specifications. Each state has different tables/tolerances |
| 6.5 | **Compliance report generator** — end-of-day/end-of-job report showing all logged values vs DOT tolerances. Exportable, signable, ready for submittal |
| 6.6 | **Specification alerts** — if user enters values outside DOT spec during calculation, show the specific clause violation (e.g., "GDOT 400.3.03.A: Tack rate must be 0.05-0.08 gal/SY for new-to-new") |
| 6.7 | **DOT spec version tracking** — GDOT specs update annually. Track which version the org is using, notify when new version drops |

---

## EPIC 7: Project Estimation & Completion Tracking

> Estimate when the entire project will finish based on current production rates.

| ID | Task |
|----|------|
| 7.1 | **Project definition** — total length, total lanes, total lifts, total tonnage needed. Lives at the job site level |
| 7.2 | **Completion percentage** — auto-calculated from logged production vs project total. Visual progress bar |
| 7.3 | **ETA calculator** — "At current rate (450 tons/day), you'll finish in 3.2 more work days" |
| 7.4 | **Production rate trends** — chart showing tons/day over time. Are you speeding up or slowing down? |
| 7.5 | **Weather-adjusted forecast** — factor in upcoming weather (rain days = no pave). Pull forecast and exclude rain days from ETA |
| 7.6 | **Milestone tracking** — "Phase 1: Base course ✓, Phase 2: Intermediate — 60%, Phase 3: Wearing — not started" |
| 7.7 | **Material ordering forecast** — "Based on remaining work, you need ~2,400 more tons. At 18.5T/truck that's 130 truck loads" |

---

## EPIC 8: Organization Reports & Analytics

> Organization-wide reporting for managers who never touch a paver.

| ID | Task |
|----|------|
| 8.1 | **Daily production summary** — auto-generated report: total tons placed, all job sites, all crews. Emailed to org admins at EOD |
| 8.2 | **Weekly/monthly rollup reports** — aggregated stats, trend charts, crew comparison |
| 8.3 | **Crew productivity comparison** — which crew is fastest? Most efficient? Least waste? (Sensitive — admin-only) |
| 8.4 | **Cost tracking** — $/ton, $/SY, $/mile placed. Track against project budget |
| 8.5 | **Waste/yield analysis** — planned vs actual tonnage per job. Where is material being wasted? |
| 8.6 | **Exportable reports** — PDF and CSV export of any report. Branded with org logo |
| 8.7 | **Scheduled email reports** — configure daily/weekly digest to stakeholders (project owner, DOT inspector, office manager) |
| 8.8 | **Dashboard widgets** — admin sees real-time tiles: "3 crews active today, 847 tons placed, 2 jobs on schedule, 1 behind" |
| 8.9 | **Historical data visualization** — charts/graphs of production over weeks/months. Seasonal trends visible |

---

## EPIC 9: Mapping & Geospatial

> Overlay work onto a map. Show where paving happened, station-by-station.

| ID | Task |
|----|------|
| 9.1 | **Job site map view** — show job site location on a map (Mapbox/Leaflet). Pin with job name, status |
| 9.2 | **Route/alignment overlay** — draw the road being paved as a polyline on the map. Color code by completion status |
| 9.3 | **Station-based progress on map** — "STA 10+00 to STA 35+00 is green (complete), 35+00 to 55+00 is yellow (in progress)" |
| 9.4 | **GPS auto-station** — use phone GPS to auto-determine current station number based on alignment geometry |
| 9.5 | **Heat map of spread rates** — overlay spread rate values along the road. Red = out of spec, green = good. Inspector's dream |
| 9.6 | **Multi-job site map** — org-level map showing all active job sites with status badges |
| 9.7 | **Geofencing** — auto-detect when crew arrives at job site (phone GPS enters geofence). Auto-start day log |
| 9.8 | **Photo geo-tagging** — photos attached to log entries pinned to their GPS location on the map |

---

## EPIC 10: Team Management & Invitations

> Proper design and functionality for team management.

| ID | Task |
|----|------|
| 10.1 | **Redesign team member page** — professional card-based layout, avatars, role badges, last-active timestamps. Not a raw table |
| 10.2 | **Styled "Add Member" modal** — proper modal with dark theme, form validation, role selector, multi-email input |
| 10.3 | **Send welcome emails to new members** — branded email when invitation is accepted: "Welcome to [Company]! Here's how to get started" |
| 10.4 | **Customizable email branding** — org can upload logo, set brand colors, customize email footer. Applied to all transactional emails |
| 10.5 | **Invitation email redesign** — professional HTML email template, not plain text. Company branding, clear CTA button |
| 10.6 | **Revoke/resend invitations** — cancel pending invites, resend expired ones |
| 10.7 | **Crew/role system** — beyond Member/Admin/Owner: Foreman, Operator, Inspector, Office roles with different permissions |
| 10.8 | **Crew grouping** — assign people to crews (Crew A, Crew B). Filter by crew in reports |
| 10.9 | **Member activity feed** — see what each member has been doing (last calculation, last log entry, last login) |
| 10.10 | **Bulk invite** — upload CSV of names/emails to invite entire crew at once |
| 10.11 | **Search/filter team members** — needed at 20+ people |

---

## EPIC 11: Per-Load Workflow & Production Tracking

> The core field workflow that doesn't exist yet.

| ID | Task | Status |
|----|------|--------|
| 11.1 | Per-load ticket tracker with running totals | 🟢 on board |
| 11.2 | **Truck ticket photo capture** — snap photo of paper ticket, OCR extract tons/ticket# | NEW |
| 11.3 | **Running yield efficiency %** — actual vs planned production rate | NEW |
| 11.4 | **End-of-day close-out workflow** — lock record, prompt missing fields, generate PDF | NEW |
| 11.5 | **Station-to-station progress logging** — "STA 10+00 to STA 15+00 complete" | NEW |
| 11.6 | **Multi-lane/multi-pass tracking** — "Lane 1 first pass" vs "Shoulder" | NEW |
| 11.7 | **Truck ETA / queue tracker** — how many trucks in pipeline | NEW |
| 11.8 | **Temperature/paving window calculator** — "Can I still pave?" per GDOT Table 4 | NEW |
| 11.9 | **Nuclear gauge / density log** — log core results with station numbers | NEW |
| 11.10 | **Load rejection tracking** — mark a load as rejected (too cold, wrong mix, contaminated) with reason | NEW |
| 11.11 | **Plant communication** — quick message to plant: "Send hotter" / "Slow down" / "Stop loading" | NEW |

---

## EPIC 12: Offline & PWA

> Must work on rural job sites with zero signal.

| ID | Task | Status |
|----|------|--------|
| 12.1 | Offline mode with sync indicator | 🟢 on board |
| 12.2 | **Full offline calculator** — all calcs work without network (already mostly true, verify) | NEW |
| 12.3 | **Offline queue with conflict resolution** — queue all writes, sync intelligently on reconnect | NEW |
| 12.4 | **PWA install prompt** — proper "Add to Home Screen" prompt with app icon | NEW |
| 12.5 | **Background sync** — queued data syncs even if app is closed (Background Sync API) | NEW |
| 12.6 | **Offline map tiles** — pre-download map tiles for known job site areas | NEW |
| 12.7 | **Data export for no-signal days** — export day's data as file that can be emailed/texted later | NEW |

---

## EPIC 13: Glossary, Onboarding & Education

> Make the app accessible to someone 2 weeks into the job.

| ID | Task | Status |
|----|------|--------|
| 13.1 | Glossary page + inline tooltips | 🟢 on board |
| 13.2 | First-use onboarding flow | 🟢 on board (child of 13.1) |
| 13.3 | **Interactive tutorial mode** — guided walkthrough of a sample calculation with a practice job | NEW |
| 13.4 | **"Why does this matter?" context** — each calculator has a 2-sentence explanation of when/why you'd use it | NEW |
| 13.5 | **Video tutorials** — 30-second screen recordings showing each calculator in use (link from help) | NEW |
| 13.6 | **Quiz/certification** — after onboarding, simple quiz: "What spread rate is correct for a 1.5 inch lift?" Gamification for new hires | NEW |

---

## EPIC 14: PDF & Document Export

> Professional documents that can be submitted to DOT, shared with clients, filed for records.

| ID | Task |
|----|------|
| 14.1 | **Daily production PDF** — auto-generated end-of-day report: all loads, spread rates, crew, weather, totals. Branded |
| 14.2 | **DOT compliance PDF** — validates every logged value against specification. Pass/fail indicators. Submission-ready |
| 14.3 | **Job completion report** — full project summary: dates, tonnage, crew hours, compliance record |
| 14.4 | **Calculation proof PDF** — for a single calculation, show all work (Epic 5) in a printable PDF format |
| 14.5 | **Customizable PDF templates** — org can adjust what fields appear, add company header/footer |
| 14.6 | **Batch export** — export a week/month of daily logs as a single PDF or CSV |
| 14.7 | **Digital signature** — foreman/inspector can sign the PDF within the app (touch signature) |
| 14.8 | **Share via email** — one-tap send any PDF to a list of recipients (DOT inspector, project owner, office) |

---

## EPIC 15: Email System & Branding

> Professional transactional emails with org customization.

| ID | Task |
|----|------|
| 15.1 | **Welcome email for new members** — sent when invitation is accepted. Includes quick-start guide |
| 15.2 | **Customizable email branding** — org uploads logo, picks brand color, edits footer text. Applied to ALL emails |
| 15.3 | **Email template library** — invitation, welcome, password reset, daily digest, weekly report, compliance alert |
| 15.4 | **Email preview** — admin can preview how branded emails look before sending |
| 15.5 | **Delivery tracking** — admin sees if emails were delivered/opened (via Resend webhooks) |
| 15.6 | **Notification preferences** — each user configures what emails they want (daily digest? load alerts? weekly report?) |

---

## EPIC 16: Data Visualization & Dashboards

> Visualize the work — charts, graphs, real-time dashboards.

| ID | Task |
|----|------|
| 16.1 | **Production chart** — line graph of tons/day over the project lifetime |
| 16.2 | **Spread rate distribution** — histogram showing how many loads were at what rate. Bell curve centered on target |
| 16.3 | **Real-time crew dashboard** — live view showing all active crews, current calculator values, last log time |
| 16.4 | **Compliance gauge** — pie chart or gauge showing % of loads within DOT spec |
| 16.5 | **Material usage vs budget** — stacked bar chart: planned tonnage vs actual by week |
| 16.6 | **Temperature timeline** — overlay ambient temp on the production chart. Show when you were near the Table 4 minimums |
| 16.7 | **Comparative day view** — side-by-side: today vs yesterday vs best day. Visual performance benchmark |
| 16.8 | **Widget-based dashboard builder** — admin arranges dashboard widgets (drag/drop) to create custom views |

---

## EPIC 17: Integrations & Automation

> Connect to the broader paving ecosystem.

| ID | Task |
|----|------|
| 17.1 | **Plant ticketing integration** — auto-import truck tickets from plant software (APAC, Martin Marietta, Vulcan) |
| 17.2 | **Trucking/dispatch integration** — import truck GPS/ETA from dispatch systems |
| 17.3 | **Weather API integration** — live weather + 10-day forecast on job site. Auto-alert if rain/cold incoming |
| 17.4 | **Webhook API** — POST events (load logged, day closed, compliance alert) to external systems |
| 17.5 | **CSV import** — import historical data from spreadsheets (common migration path for existing crews) |
| 17.6 | **QuickBooks/accounting export** — export material costs for invoicing |
| 17.7 | **HCSS integration** — connect to HCSS HeavyJob (dominant paving project management software) |

---

## EPIC 18: Job History & Audit

> Track everything, compare performance, maintain accountability.

| ID | Task |
|----|------|
| 18.1 | **Job history browser** — view any past day's log, any past job's data |
| 18.2 | **Yesterday comparison** — "You placed 430T yesterday, 380T today — 12% behind" |
| 18.3 | **Audit log** — immutable record: who changed what, when. Required for DOT compliance |
| 18.4 | **Data retention policy** — configurable per org. Auto-archive after X days, never delete |
| 18.5 | **Search across all logs** — "Find all days where spread rate exceeded 200 lbs/SY" |
| 18.6 | **Export complete job record** — all data for a job site as a single archive (ZIP: PDFs + CSV + photos) |

---

## EPIC 19: Safety & Permissions

> Protect data, prevent accidents, satisfy compliance requirements.

| ID | Task |
|----|------|
| 19.1 | **Role-based access control** — foremen see their crew only, admins see all, operators see calculators only |
| 19.2 | **Data lock after close-out** — once a day is "closed," no edits without admin override + audit note |
| 19.3 | **Two-factor authentication** — optional 2FA for admin accounts |
| 19.4 | **Session management** — see active sessions, force logout of stolen devices |
| 19.5 | **IP/device logging** — track which devices accessed the account |
| 19.6 | **Data export (GDPR-style)** — user can export all their data |

---

## EPIC 20: Billing & SaaS Infrastructure

> Make it a real business.

| ID | Task |
|----|------|
| 20.1 | **Pricing tiers** — Free (1 user, basic calcs), Pro ($X/mo per seat, full features), Enterprise (custom) |
| 20.2 | **Stripe integration** — subscription billing, payment method management |
| 20.3 | **Usage metering** — track feature usage for tier enforcement |
| 20.4 | **Trial management** — 14-day free trial of Pro, auto-downgrade to Free |
| 20.5 | **Invoice generation** — automatic monthly invoices |
| 20.6 | **Admin billing dashboard** — current plan, usage, next invoice date, payment history |

---

## Dependency Summary

```
EPIC 1 (Bug Fixes) ──────────────────┐
EPIC 2 (Mobile) ─────────────────────┤──→ EPIC 4 (UX Polish) ──→ EPIC 13 (Onboarding)
EPIC 3 (Desktop Redesign) ───────────┤
                                      ├──→ EPIC 10 (Team Mgmt) ──→ EPIC 15 (Email)
EPIC 1.3 (Daily Log fix) ────────────┤──→ EPIC 11 (Per-Load) ──→ EPIC 7 (Estimation)
                                      │                        ──→ EPIC 14 (PDF Export)
                                      │                        ──→ EPIC 6 (DOT Standards)
                                      ├──→ EPIC 9 (Mapping)
                                      ├──→ EPIC 16 (Visualization) ──→ EPIC 8 (Reports)
                                      ├──→ EPIC 12 (Offline)
                                      ├──→ EPIC 18 (Audit/History)
                                      └──→ EPIC 5 (Show Work) ──→ EPIC 6 (DOT)
                                      
EPIC 10 + EPIC 15 ──→ EPIC 19 (Security) ──→ EPIC 20 (Billing)
EPIC 17 (Integrations) — independent, can start anytime after EPIC 11
```

---

## Task Count Summary

| Epic | Tasks | Priority |
|------|-------|----------|
| 1. Bug Fixes | 12 | 🔴 Critical |
| 2. Mobile Redesign | 8 | 🔴 Critical |
| 3. Desktop Redesign | 10 | 🟡 High |
| 4. UX Polish | 8 | 🟡 High |
| 5. Show Your Work | 6 | 🟡 High |
| 6. DOT Standards | 7 | 🟡 High |
| 7. Project Estimation | 7 | 🟡 High |
| 8. Org Reports | 9 | 🟡 High |
| 9. Mapping | 8 | 🟢 Medium |
| 10. Team Management | 11 | 🟡 High |
| 11. Per-Load Workflow | 11 | 🔴 Critical |
| 12. Offline/PWA | 7 | 🟡 High |
| 13. Onboarding | 6 | 🟡 High |
| 14. PDF Export | 8 | 🟡 High |
| 15. Email & Branding | 6 | 🟢 Medium |
| 16. Visualization | 8 | 🟢 Medium |
| 17. Integrations | 7 | 🟢 Medium |
| 18. History & Audit | 6 | 🟢 Medium |
| 19. Security | 6 | 🟢 Medium |
| 20. Billing | 6 | ⚪ Future |
| **TOTAL** | **157** | |

---

## Next Steps

Tasks will be created on the kanban board in priority order:
1. Remaining EPIC 1 bug fixes (not yet on board)
2. EPIC 3 desktop redesign (new)
3. EPIC 5 show your work
4. EPIC 6 DOT standards
5. EPIC 10 team management
6. EPIC 15 email branding
7. EPIC 7 project estimation
8. EPIC 9 mapping
9. EPIC 8 org reports
10. EPIC 14 PDF export
11. And so on...

Each task uses Claude Code via the `paverate-dev` profile, creates an isolated feature branch, and PRs back to `feat/auth-and-data`. The integration task validates all merges compile cleanly.

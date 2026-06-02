# PaveRate Site Review — Multi-Persona UX Audit

**Date:** June 1, 2026  
**Site:** dev.paverate.com  
**Reviewers:** 3 AI agents acting as Organization Admin, Field Foreman, Inexperienced Operator

---

## Executive Summary

PaveRate has a **strong technical foundation** — the calculators are accurate, GDOT spec references are legitimate, and the Job Setup → calculator integration is genuinely clever. The Spread Rate calculator with its red/green gauge and spec-compliance warnings is the standout feature.

However, the app currently speaks **to paving professionals only**. Critical gaps exist in mobile usability (touch targets too small for gloves), workflow completeness (no per-load tracking), and new-user accessibility (jargon everywhere, no onboarding).

### Verdict by User Type

| User | Can they use it today? | Biggest blocker |
|------|----------------------|-----------------|
| Org Admin | ⚠️ Partially | Job site creation broken, settings inaccessible |
| Field Foreman | ✅ Calculators work | No per-load workflow, touch targets too small |
| New Operator | ❌ Would give up | No onboarding, unexplained jargon everywhere |

---

## 🟢 What's Working Well

### Calculators (All Users Agree)
1. **Spread Rate calculator is the star** — dual Target vs. Actual display, red/green gauge, "Out of spec" badge with Table 12 reference. Inspectors love this.
2. **Stick Check is beginner-friendly** — single input, instant answer, clear cross-section diagram showing existing road → compacted → loose material.
3. **Real-time calculation** — results update as you type, no submit button needed.
4. **"How this is figured" expandable sections** — keeps UI clean but provides formulas on demand for inspectors or curious users.
5. **Job Setup → Calculator integration** — set width/lift/machine once, all calculators pull from it. Very smart design.
6. **Distance Planner dual output** — shows both "623 feet available" AND "55 tons needed to cover 500 ft" simultaneously.
7. **Tack Rate with min/max range** — showing "67 gal (range 53–80)" accounts for field variation.

### Platform & Design
8. **No login wall** — calculators work immediately without registration. Critical for adoption.
9. **Dark theme** — high contrast gold/yellow on dark is good for field use, less blinding outdoors.
10. **"Log to Today" confirmation** — shows "READY TO LOG: 25 t over 500 ft @ 75 lbs/SY" BEFORE you commit. Prevents fat-finger mistakes.
11. **Job Setup persistent banner** — "12 ft wide · 1.5" lift · Paver · 0% waste · 165 lbs/SY target" always visible.
12. **Feet Left Today progress bar** — paver icon sliding along a progress bar showing % complete. Great for reporting.
13. **Registration flow** — clean, fast, auto-logs in, immediately lands on dashboard.

---

## 🔴 Critical Bugs

| # | Bug | Impact | Found By |
|---|-----|--------|----------|
| 1 | **"Create Job Site" button does nothing** — form fills correctly but submission fails silently. No error, no success toast. | Org admins cannot create job sites at all | Admin |
| 2 | **Settings page redirects to Dashboard** — `/dashboard/settings` immediately bounces back. Route is broken or missing. | No company settings, no defaults configuration | Admin |
| 3 | **"+ Add Entry" button in Daily Log does nothing** — clicking produces no form/dialog. Manual entry workflow is broken. | Foremen can't manually log entries | Foreman |
| 4 | **Job Setup stays open when switching calculators** — clicking a calculator in the sidebar changes content but leaves Job Setup expanded, creating confusing layered view | New users get lost | Operator |
| 5 | **Calculator switching sometimes requires double-click** — stale state issue when navigating between calculators | Costs precious seconds between trucks | Foreman |
| 6 | **`CONST.TRUCK_LOAD` appears in help text** — raw code variable name leaking into user-facing UI | Confuses everyone, looks broken | Operator |

---

## 🟡 UI/UX Issues

### Touch & Mobile (Critical for Field Use)

| # | Issue | Severity |
|---|-------|----------|
| 7 | **Input fields ~32px wide** — critically undersized for gloved hands. Field standard is 44-48px minimum (Apple/Google HIG). | 🔴 |
| 8 | **Checkboxes 18×18px** — WCAG requires 24px min, Apple recommends 44px | 🔴 |
| 9 | **Three-column desktop layout on mobile** — sidebar + calculator list + calculator panel + live rates = 4 zones on a 375px screen | 🔴 |
| 10 | **"Log to Today" button requires scrolling** — at bottom of long calculators, not sticky | 🟡 |
| 11 | **Waste % buttons too closely packed** — "0%", "5%", "10%" easy to mis-tap | 🟡 |
| 12 | **Spinbutton time pickers too small** — Hours/Minutes/AM-PM individual segments, should use native `<input type="time">` | 🟡 |
| 13 | **Yellow text in direct sunlight** — gold on dark is good indoors but washes out at high brightness | 🟡 |

### Navigation & Discoverability

| # | Issue | Severity |
|---|-------|----------|
| 14 | **"JOB SETUP" bar looks like a status label, not a button** — no chevron, no "Edit" label, no visual affordance | 🔴 |
| 15 | **Login button buried at bottom of sidebar** — new users may never find it | 🟡 |
| 16 | **No "back" navigation or breadcrumbs** — no confirmation of which calculator you're on | 🟡 |
| 17 | **"Settings" link visible in nav but broken** — creates confusion and broken trust | 🟡 |
| 18 | **Stats bar shows "0 Job Sites / 0 Active / 0 Saved"** with no empty-state guidance | 🟡 |
| 19 | **Team table will overflow on 375px mobile** — 5 columns won't fit, long emails break layout | 🟡 |

### Feedback & Confirmation

| # | Issue | Severity |
|---|-------|----------|
| 20 | **No toast/confirmation after "Log to Today"** — did it save? User can't tell | 🟡 |
| 21 | **No success/failure message on invite send** — form just closes silently | 🟡 |
| 22 | **"Out of spec" message gives no actionable guidance** — new user doesn't know what to DO | 🟡 |

---

## 🔴 Missing Features — Priority Ranked

### Tier 1: Blocking Real Field Use

| # | Feature | Who Needs It | Why |
|---|---------|-------------|-----|
| 23 | **Per-load ticket tracker** — log each truck: ticket #, tons, time in/out, running total | Foreman | This is THE primary field workflow. "Load 1: 18.5T @ 7:42am, Load 2: 18.3T @ 8:15am..." |
| 24 | **Glossary / tooltips for jargon** — SY, lbs/SY, tack coat, screed, OGFC, PEM, MTV, Table 4, Table 12 | Operator | Without this, new hires give up immediately |
| 25 | **First-use onboarding** — guided tour pointing to Job Setup first, explaining basic flow | Operator | Zero guidance on where to start |
| 26 | **Clear/Reset button per calculator** — wipe last entry fast between loads | Foreman | With gloves, select-all-delete-retype is nightmare |
| 27 | **Offline mode with indicator** — does PWA cache work? Users need to KNOW | Foreman | Rural job sites often have no signal |

### Tier 2: Expected by Paying Orgs

| # | Feature | Who Needs It | Why |
|---|---------|-------------|-----|
| 28 | **Organization settings** — company name, logo, address, defaults | Admin | No way to configure anything about the org |
| 29 | **Org-wide default parameters** — lift thickness, mix type, spread rate targets, waste factor | Admin | Crews shouldn't configure these per-job |
| 30 | **Photo attach to log entries** — camera integration for tickets, mat, issues | Foreman | Standard practice on every job site |
| 31 | **Running yield efficiency %** — tons-per-hour vs planned, auto-calculated | Foreman | "You're at 88% of planned production" |
| 32 | **End-of-day close-out workflow** — lock record, prompt missing fields, generate PDF | Foreman | No structured end-of-day process |
| 33 | **Station-to-station progress** — "STA 10+00 to STA 35+00 complete" | Foreman | Industry-standard progress notation |

### Tier 3: Nice-to-Have / Differentiators

| # | Feature | Who Needs It | Why |
|---|---------|-------------|-----|
| 34 | **Crew/role granularity** — Foreman vs Laborer, crew grouping, multi-crew | Admin | Only 3 roles (Member/Admin/Owner) is too flat |
| 35 | **Job history / yesterday comparison** — see previous days for comparison | Foreman | "Are we ahead or behind yesterday?" |
| 36 | **Truck ETA / queue tracker** — simple counter of trucks in pipeline | Foreman | Avoid paver starvation |
| 37 | **Boss/office share button** — one-tap send day summary via text/email | Foreman | PDF exists but no send integration |
| 38 | **Audit log / activity history** — who logged what, when | Admin | Accountability and error tracing |
| 39 | **Revoke/cancel pending invitations** | Admin | Can't undo invite mistakes |
| 40 | **Search/filter team members** — needed at scale | Admin | Flat table unmanageable with 50+ crew |
| 41 | **Temperature / paving window calculator** — "Can I still pave?" red/green indicator | Foreman | Asked 10+ times/day on cold days |
| 42 | **Multi-lane / multi-pass tracking** | Foreman | Widening jobs need lane distinction |
| 43 | **Nuclear gauge / density log with station numbers** | Foreman | QC documentation requirement |

---

## 🔵 Logic & Safety Issues

| # | Issue | Risk |
|---|-------|------|
| 44 | **Owner can change their own role** — could accidentally demote to Member | Org lockout |
| 45 | **Owner can "Remove" themselves from org** — no guard, could orphan the organization | Data loss |
| 46 | **Custom target field easily fat-fingered** — accidentally overrides thickness-based rate with no undo | Wrong spread rate in field |
| 47 | **"Silo" terminology ambiguous** — is it plant silo or paver hopper? Context matters | Wrong calculation inputs |
| 48 | **Tack Rate doesn't confirm which width it's using** — job width applied silently | Potential miscalculation if user forgot to set width |
| 49 | **Day conditions (temp, wind, crew) buried at bottom** — foremen fill this FIRST at start of day | Workflow ordering mismatch |
| 50 | **Today log doesn't feed back into calculators** — logging spread rate doesn't update "tons placed so far" in Feet Left | Data silos within same session |

---

## 📋 Prioritized Recommendations

### Sprint 1 — Fix What's Broken (1-2 days)
- [ ] Fix Job Site creation API (silent failure → working or error message)
- [ ] Fix Settings route (show page or "Coming Soon" — don't redirect silently)
- [ ] Fix "+ Add Entry" button in Daily Log
- [ ] Fix Job Setup auto-close when calculator selected
- [ ] Remove `CONST.TRUCK_LOAD` from user-facing text
- [ ] Add toast confirmations for all save/log actions
- [ ] Prevent owner self-demotion and self-removal

### Sprint 2 — Mobile-First Fixes (3-5 days)
- [ ] Increase all input fields to 48px minimum height
- [ ] Increase checkboxes to 44px tap targets
- [ ] Design single-column mobile layout (collapse sidebar to bottom nav or hamburger)
- [ ] Make "Log to Today" a sticky bottom button on mobile
- [ ] Add spacing between Waste % buttons
- [ ] Replace spinbutton time pickers with native inputs
- [ ] Add visual chevron/affordance to Job Setup bar

### Sprint 3 — Accessibility & Onboarding (3-5 days)
- [ ] Add glossary page (link from every jargon term)
- [ ] Add inline tooltips for: SY, lbs/SY, OGFC, PEM, MTV, Table 4, Table 12, screed, tack coat
- [ ] First-use onboarding flow (3-step: "Set up your job → Pick a calculator → Log results")
- [ ] Add "What should I do?" guidance to out-of-spec warnings
- [ ] Expand tack application type descriptions

### Sprint 4 — Killer Features (1-2 weeks)
- [ ] Per-load ticket tracker with running totals
- [ ] Clear/Reset button on each calculator
- [ ] Bidirectional calculator ↔ daily log sync
- [ ] Offline mode with sync indicator
- [ ] Photo attachment to log entries
- [ ] End-of-day close-out workflow

### Sprint 5 — Org Management (1-2 weeks)
- [ ] Organization settings page (name, logo, defaults)
- [ ] Org-wide calculator defaults
- [ ] Crew roles beyond Member/Admin/Owner
- [ ] Invitation revoke
- [ ] Team search/filter
- [ ] Audit log

---

## Methodology

Three AI agents independently navigated dev.paverate.com using browser automation, each adopting a distinct persona:

1. **Organization Admin** — registered fresh account, created org, tested team management, invites, job sites, settings
2. **Field Foreman** — focused on calculator speed, daily workflow, logging, field-realistic scenarios (gloves, sun, between trucks)
3. **Inexperienced Operator** — tested with zero paving knowledge, looked for help text, clear labels, onboarding guidance

Each agent spent ~50 browser interactions exploring the site. Findings were cross-referenced and deduplicated.

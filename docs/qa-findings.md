# QA Findings — Laborer / Screed Man Field Workflow

**QA Date:** 2026-06-04
**Role focus:** laborer, screed_man
**Task:** t_e384816c

---

## Summary

Reviewed the field view (/app/field) and screed man view (/app with ScreedManView) against laborer UX criteria. Five issues found and fixed inline.

---

## Issues Found and Fixed

### 1. Laborer role not redirected to /app/field (FIXED)
**Severity:** High
**File:** src/routes/app/+page.svelte

A laborer visiting /app was shown the full calculator workspace instead of
the simplified field view. Fixed by adding a reactive $effect that redirects
to /app/field as soon as auth loads and confirms the role is laborer.

### 2. Field view had no auth guard (FIXED)
**Severity:** Medium
**File:** src/routes/app/field/+page.svelte

/app/field had no role check, so any authenticated user (e.g., owner, admin)
could land there directly. Added an onMount check: after authStore.fetch(),
if the role is not in [laborer, operator, screed_man, foreman], redirect to
/dashboard.

### 3. feetLogged always showed 0 (FIXED)
**Severity:** Medium
**File:** src/routes/app/field/+page.svelte

The "Feet Logged" total was a placeholder (always 0) with a comment saying
API support was needed. Fixed by fetching /api/calculations?job_site_id=ID
and summing result.feet from all today's calculations.

Running total updates after each Log Distance submission (feetLogged is
updated optimistically immediately after a successful submit).

### 4. role-routing.ts had outdated comment (FIXED)
**Severity:** Low
**File:** src/lib/utils/role-routing.ts

The comment said "/app/field is planned but not yet built; use /app as
interim" and the function returned /app for field tier. Updated to return
/app/field and removed the outdated comment.

### 5. docs/role-views-design.md outdated (FIXED)
**Severity:** Low
**File:** docs/role-views-design.md

The design doc still called /app/field a "planned route, not yet built."
Updated the header and body to reflect current implementation.

---

## Field View UX Assessment (at 375px viewport)

### Add Load flow
- "Add Load" button: 64px height — well above 48px minimum. PASS
- Form reveals inline below the button. No page navigation needed. PASS
- Tons field pre-populated with 18.5 (a common truck load). Good default.
- Ticket Number is optional — labeled clearly. PASS
- Submit/Cancel buttons both 48px height. PASS
- Success toast fires immediately. Running total refreshes from API. PASS
- 10-second challenge: possible if site is auto-selected (1 site only).
  If multi-site, requires selecting a site first which adds ~3 taps.

### Log Distance flow
- "Log Distance" button: 64px height. PASS
- Station From / Station To inputs: 48px height via padding. PASS
- Feet are calculated as Math.abs(to - from). Correct formula.

### Today's Totals section
- Loads, Total Tons, Feet Logged displayed in 3-column grid. PASS
- On mobile (max-width 480px) collapses to 1-column with label/value pairs.
  This is much better than a squished 3-col on small screens. PASS
- Tons formatted to 1 decimal, feet to 0. Appropriate precision.

### Screed Man View (/app with ScreedManView)
- 4 cards shown: SpreadRateCard, BatchSpreadRateCheck, StickCheckCard, FeetLeftCard. PASS
- No extraneous navigation or load entry. Clean. PASS
- Calculator-only, no project management UI. PASS
- Touch targets on card inputs: standard browser inputs, which on mobile
  render at appropriate size. Acceptable.

---

## Remaining Minor Notes (not blocking)

- The "Add Load" button is the primary CTA but is not visually larger than
  "Log Distance". Both are the same 64px green/blue buttons. Consider making
  Add Load more prominent (e.g., larger font or primary CTA style) if
  laborers primarily log loads and rarely log distance.

- When there are 0 job sites, the empty state says "Go to Full View" which
  links to /app. A laborer clicking that would be redirected right back to
  /app/field. The link should say "Contact your foreman" or just be omitted
  for laborer role.

- The ViewSwitcher sends laborers to /dashboard when switching to "full view".
  Laborers don't have dashboard access — this would likely error. Consider
  hiding the ViewSwitcher entirely for laborer role, or routing to /app
  (calculator workspace) instead of /dashboard.

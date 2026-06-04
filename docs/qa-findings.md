# PaveRate QA Findings

This document accumulates QA findings across multiple test sessions.

---

## Foreman Role Workflow QA (2026-06-04)

**QA Date:** 2026-06-04
**Role focus:** foreman / owner (same full view tier)
**Task:** t_035d9f96
**Environment:** dev.paverate.com
**Tester:** qaforeman6@paverate.test (owner role, full view tier same as foreman)

### Summary

Walked through the foreman daily workflow on dev.paverate.com: dashboard load, project
creation, navigate to job site, open daily log, fill site conditions, and EOD close-out.
Three confirmed bugs found.

---

### Issues Found

#### QA-FO-01: "New Load" and "Log First Load" buttons do not open load form — HIGH
**Severity:** High
**Symptoms:** Clicking "New Load" or "Log First Load" buttons in the Load Tracker
section of the Overview tab does nothing. No load entry form appears.
API call POST /api/job-sites/[id]/loads returns 201 successfully, so the API works.
The button click handler is not firing or the form state is not opening.
**Steps to Reproduce:**
1. Log in and navigate to any job site (Dashboard > Projects > [project])
2. Scroll to "Load Tracker" section on Overview tab
3. Click "New Load" or "Log First Load" button
4. No form appears
**Expected:** Load entry form opens inline or as a modal
**Root cause suspect:** Event propagation / pointer-events issue from overlapping
elements in the Load Tracker section. Or the form open state is tied to a daily log
that doesn't yet exist for today.
**Files to investigate:**
- src/routes/dashboard/job-sites/[id]/+page.svelte (Load Tracker section)
- src/lib/components/ LoadTracker or similar component

#### QA-FO-02: Completion badge does not update reactively when filling site conditions — MEDIUM
**Severity:** Medium
**Symptoms:** The "0% Missing: Temperature Crew Count Start Time End Time Log Entry"
badge in the daily log header stays at 0% even after entering Temperature (78),
Crew Count (5), and Start Time.
**Steps to Reproduce:**
1. Open daily log for a project (Dashboard > Projects > [project] > Daily Log > Open today's log)
2. Enter temperature = 78 in Temp field
3. Enter crew = 5 in Crew field
4. Click "Now" to set start time
5. Badge still shows "0% Missing: Temperature Crew Count Start Time..."
**Expected:** Badge updates reactively as fields are filled, removing satisfied items
from the "Missing" list and incrementing the percentage
**Root cause suspect:** The completion badge is computing against the DB-persisted
values (all null since autosave hasn't fired) rather than the current in-memory form
state. The badge should read from the local reactive state, not from server data.
**Files to investigate:**
- src/routes/dashboard/job-sites/[id]/log/+page.svelte — completion badge logic

#### QA-FO-03: Site conditions not persisted to DB (autosave not triggering) — HIGH
**Severity:** High
**Symptoms:** After filling in temperature, crew count, and start time in the
Site Conditions section and then closing the day, the DB still shows null for all
site condition fields. Confirmed via API:
  GET /api/job-sites/.../logs/[id] returns: {"temp":null,"crew":null,"start":null}
even though the fields were visually filled in the form.
**Steps to Reproduce:**
1. Open daily log
2. Enter temperature = 78
3. Enter crew = 5
4. Click "Now" to set start time to current time
5. Click "Close Out Day" > enter foreman name > "Close Without PDF"
6. After close, GET the log via API: temp, crew, start_time are all null
**Expected:** Autosave should persist field values within a few seconds of input.
After EOD close, all filled site conditions should be readable via the API.
**Root cause suspect:** The autosave debounce for site conditions fields may be
triggering a PUT request but the request body may be missing these fields, or the
debounce delay is too long and the page unloads/navigates before it fires.
Also possible: spinbutton inputs for Temp, Crew don't trigger the onChange that
drives the autosave — they may need oninput/onchange handlers.
**Files to investigate:**
- src/routes/dashboard/job-sites/[id]/log/+page.svelte — autosave logic for site conditions

#### QA-FO-04: EOD close-out UI button silently fails — MEDIUM
**Severity:** Medium
**Symptoms:** Clicking "Close Without PDF" in the Close Out Day dialog does not
close the dialog or show any success/failure feedback. The dialog remains open.
The API call POST /api/.../logs/[id]/close returns 200 when called directly, so
the endpoint works. The button click is not triggering the API call or the
response handler is not running.
**Steps to Reproduce:**
1. Open daily log
2. Click "Close Out Day"
3. Enter foreman name in "Foreman Signature *" field
4. Click "Close Without PDF"
5. Dialog stays open, no feedback
**Expected:** Dialog closes, page shows "Day Closed — [Foreman Name]" banner,
log transitions to closed state
**Files to investigate:**
- src/routes/dashboard/job-sites/[id]/log/+page.svelte — close-out handler
- Look for form submit / button onclick binding for the close modal

#### QA-FO-05: DOT Compliance section shows no gauge without spread rate config — LOW
**Severity:** Low (UX gap, not a bug)
**Symptoms:** DOT Compliance section shows "Set a target spread rate in job
configuration to see compliance" with no gauge or compliance indicator.
**Note:** This is by design. However for a new foreman on a new project, this
section is empty with no inline link to configure it. A "Set in Configuration"
link would improve discoverability.

---

### Flows Tested

| Flow | Result | Notes |
|------|--------|-------|
| Dashboard load | PASS | Loaded, projects list visible |
| Navigate to project | PASS | /dashboard/job-sites/[id] loads correctly |
| New Load button (Overview) | FAIL | Button click does nothing (QA-FO-01) |
| Open Daily Log tab | PASS | Tab click worked, "Open today's log" link visible |
| Open today's log | PASS | Daily log page loads with all sections |
| Fill site conditions | PARTIAL | Fields accept input but not saved (QA-FO-03) |
| Completion badge update | FAIL | Badge stays at 0% regardless of input (QA-FO-02) |
| EOD close-out dialog open | PASS | Close Out Day dialog appears correctly |
| EOD close-out (Close Without PDF) | FAIL | Button silently fails in browser (QA-FO-04) |
| EOD close-out via API | PASS | POST .../close returns 200, log marked closed |
| DOT Compliance gauge | N/A | Requires spread rate config in project settings |

---

### Prior QA Sessions (Mobile Responsiveness — 2026-06-03)

#### QA-MR-01: OverviewTab link-tiles grid — LOW (Fixed)
**Fixed in:** commit from task t_6038c2a1

#### QA-MR-02: OverviewTab lightbox close button touch target — LOW (Fixed)
**Fixed in:** commit from task t_6038c2a1

#### QA-MR-03: Other mobile grid issues — LOW (Fixed)
**Fixed in:** commit from task t_6038c2a1

---

### Prior QA Sessions (Laborer/Screed Workflow — 2026-06-03)

Issues found and fixed in task t_e384816c — see git log for details.

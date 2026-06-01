# Paverate — Requirements

> **App name:** **Paverate**. Use this name everywhere in the UI, manifest,
> page title, and branding. Logo assets live in [`branding/`](../branding).

## Target Users

Asphalt paving crew members (foremen, operators, inspectors) who need quick calculations in the field.

## Environment Constraints

- **Outdoor use** — bright sunlight, needs high contrast
- **Dirty/gloved hands** — large touch targets (minimum 48px), no small buttons
- **Quick access** — most-used calculators should be 1 tap from home screen
- **No connectivity** — must work fully offline (PWA with service worker)
- **Mobile-first** — primary use on phones; tablet/desktop is secondary

## Core UX Principles

1. **Speed over polish** — get the answer in as few taps as possible
2. **Big numbers** — results should be immediately readable at arm's length
3. **Memory** — remember last-used values (road width, mix type, etc.)
4. **Unit clarity** — always show units next to values (lbs/SY, gal/yd², ft, etc.)
5. **Zero friction to calculate** — the calculators work fully without an account.
   Login is **optional** and only unlocks saving/sharing (see "Accounts &
   Organizations"). A signed-out user can open the app and get an answer
   immediately, exactly as today.

## Screen Layout (Proposed)

### Home Screen
- Grid of calculator tiles (large, thumb-friendly)
  - Spread Rate
  - Remaining Distance
  - Tack Rate
  - Tonnage to Order
  - Stick Check
  - Reference Tables

### Calculator Screens
- Large numeric input fields
- Smart defaults from last use (localStorage)
- Inline unit labels
- Big bold result display
- Optional "show work" expandable section showing the formula steps
- Quick-clear / reset button

### Reference Tables Screen
- Searchable/filterable
- Lift thickness table with temp warnings
- Mix type specifications
- Tack rate ranges
- Spread rate conversion chart

## Color Scheme

Keep it **clean, simple, and non-invasive** — the UI should stay out of the way
so the number is the hero. Derive the palette from the Paverate logo (dark
slate + a single yellow accent) and define every color as a token in the
single config file (see "Single Source of Configuration") so it can be retuned
without touching code.

- **Restrained palette** — neutral background, one dark slate for structure,
  **one** yellow accent (used sparingly: the active/primary action and the big
  result). Avoid heavy fills, gradients, or decorative color.
- **Dark mode default** for outdoor visibility and OLED battery; a light mode
  is a nice-to-have, also driven from the same tokens.
- **High contrast, low noise** — large white/yellow numerals on a dark
  background; generous spacing; minimal borders.
- **Status colors are semantic, not decorative** — green = in spec, amber =
  out of range / caution, red = blocked (e.g. interstate emulsion ban, below
  temp minimum). These are the only place strong color appears beyond the accent.
- **No branding clutter** — the logo appears once (home header); it does not
  repeat on every calculator screen.

## Technical Requirements

- [ ] PWA manifest + service worker for offline
- [ ] installable to home screen (iOS + Android)
- [ ] localStorage for persisting last-used values
- [ ] **Calculators run fully client-side** — no backend needed for the core
      math; the app is usable signed-out and offline. Account/organization
      features (below) are an **optional cloud layer** layered on top, never a
      prerequisite for calculating.
- [ ] Bundle size < 200KB for the core calculator (fast load on spotty cell);
      account/admin code may be lazy-loaded so it never weighs down the field path.
- [ ] Works on iOS Safari 15+ and Chrome Android 90+

## Accessibility

- Minimum font size 16px for inputs (prevents iOS zoom)
- WCAG AA contrast ratios minimum
- Logical tab order
- No horizontal scrolling on any screen size

---

## Single Source of Configuration

**Every value, formula reference, spec rate, constant, color token, and label
must live in one easily editable place** so a non-developer (or the author) can
retune the app without hunting through code.

- **One config file** is the source of truth. Preferred format: **YAML** (or
  JSON) for data — constants, GDOT table values, tack/temperature/thickness
  ranges, material densities, default remembered values, and theme color
  tokens.
- **Formulas may live in Python** (or a single, clearly-named formulas module)
  if they are not practical to express as data — but each formula must still
  reference a **stable ID** that maps to the [Validation Matrix](validation-matrix.md)
  (e.g. `CALC.SPREAD_PLACED`, `CONST.TRUCK_LOAD`, `TACK.NEW_AC`).
- **No magic numbers in code.** Any spec value or constant a calculator uses
  must be read from the config by its matrix ID — never hardcoded inline. This
  keeps the [single-writer rule](VALIDATION.md#7-change-management-keeping-it-valid-over-time)
  enforceable and lets the verification badges stay accurate.
- **What the config covers (single file or a small, obvious config directory):**
  - Constants (`CONST.*`) — SF/SY, lb/ton, truck load, retention, multipliers, etc.
  - Spec tables (`TACK.*`, `TEMP.*`, `THICK.*`, `DENSITY.*`) with their values,
    units, tier, citation, and verification status.
  - Default remembered values (road width, mix, machine, truck size, tack type).
  - Theme tokens (background, slate, accent, semantic green/amber/red).
  - UI labels/copy for calculators where practical, so wording is editable too.
- **Validation linkage:** the config is effectively the machine-readable export
  of the validation matrix. Changing a value in the config is the same act as
  updating its matrix row; status (`VERIFIED` / `FIELD_ESTIMATE` / `UNVERIFIED`)
  travels with the value and is shown in the app's "why?" / source view.

---

## Accounts & Organizations (Framework — not implemented yet)

> **Scope note:** Design the app so these can be added later **without** breaking
> the signed-out, offline-first field experience. Build the seams (interfaces,
> data shapes, route guards) now; implement the backend later. Calculating must
> never require an account or connectivity.

### Guiding principles

- **Optional, additive layer.** Anonymous local use stays the default. Signing
  in only adds save/sync/share and admin capabilities.
- **Local-first sync.** Calculations are created locally and work offline; when
  signed in and online, they sync to the user's organization. Offline edits
  reconcile on reconnect.
- **Least privilege.** A user sees only the jobsites/organizations they are
  assigned to.

### 1. Login / Authentication

- Email + password to start; design the auth boundary so SSO/OAuth providers
  can be added later.
- Sessions persist on the device; signing out drops back to anonymous local mode
  (local calculations remain available on that device).
- All account UI is **lazy-loaded** and off the critical field path.

### 2. Organizations (companies)

- An **Organization** represents a company. A user belongs to one or more orgs.
- Org-level settings can override config defaults (e.g. a company's standard
  truck load size, default mix, preferred densities) — still sourced through the
  single config mechanism, just scoped to the org.
- Roles within an org: **Member**, **Org Admin** (see admin panels below).

### 3. Job Site Organization (saved calculations by jobsite)

- A **Job Site** belongs to an Organization and groups saved calculations
  (spread rate, tonnage, tack, soil/cement, etc.) with timestamps and the
  inputs used.
- Users **assigned** to a jobsite can view its calculation history; unassigned
  users cannot see it.
- Each saved calculation records: calculator type, inputs, result, the config
  values/IDs in effect at the time (for auditability), who ran it, and when.
- Works offline: a calculation is captured locally and attributed to a jobsite
  when one is selected, then synced.

### 4. Org Admin Panel (for Organization Admins)

- Manage **members**: invite, assign roles (Member / Org Admin), remove.
- Manage **job sites**: create, archive, assign users to jobsites.
- Manage **org defaults/overrides** (the org-scoped config values above).
- View the org's saved calculations across its jobsites.

### 5. Global Admin Panel (platform owner)

- Manage **organizations**: create, suspend, delete; assign Org Admins.
- Cross-org visibility for support/operations (audit, usage), with appropriate
  guards and logging.
- Manage the **base/default configuration** that organizations inherit and may
  override.

### Data model sketch (for later implementation)

```
GlobalAdmin
  └─ Organization (company)
       ├─ org config overrides (truck load, mix, densities, …)
       ├─ Members (User ↔ Org with role: Member | OrgAdmin)
       └─ JobSite
            ├─ assigned Users
            └─ SavedCalculation (type, inputs, result, configSnapshot, by, at)
```

Roles, top to bottom: **Global Admin → Org Admin → Member**, with **anonymous
local** as the always-available baseline that needs none of the above.

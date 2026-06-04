# PaveRate Responsive UI Design

## 1. Current State

PaveRate was built mobile-first but the current implementation has uneven responsive coverage:

- **Phone (<640px)**: Good overall — 48px touch targets, vertical stacks, drawer-based nav. Some cards (CalcCard, dashboard stats grid) have no density increase even on wider phones (e.g. 390px landscape = 844px wide).
- **Tablet (640–1024px)**: Partially handled. The AppShell switches to a 72px icon-rail sidebar at 900px. Content area goes from single-column to open-width but cards still use phone-era widths, leaving big empty margins.
- **Desktop (>1024px)**: AppShell switches to 240px labelled sidebar at 1100px with a 1400px max-width cap. Most page content is still single-column flex with no multi-column grid layout. The context panel (--context-w: 400px) is only used by the `/app` Quick Calc route.

Pain points:
- Dashboard home: single-column flex stack on tablet/desktop. Stats row uses `auto-fit minmax(160px,1fr)` which is fine but the rest of the page ignores available width.
- Job Site detail: single-column tabs on all breakpoints. A 1440px desktop shows a 700px-wide single column with 350px of empty space each side.
- Quick Calc (/app): two-column layout kicks in only at 1320px (very late); tablet 640–1319px is still single-column even though space is available at 900px+.
- Nav sidebar: disappears entirely on phone (replaced by top drawer). No intermediate collapsed-icon-only rail for 640–899px.
- Spacing too generous on phone: 12px/16px outer padding is correct, but cards inherit 24px padding intended for desktop.

---

## 2. Breakpoints

Three canonical breakpoints mapped to CSS custom properties:

| Token        | Value  | Name    | Description                                              |
|-------------|--------|---------|----------------------------------------------------------|
| (implicit)  | <640px | phone   | Single-column, drawer nav, max density, 48px targets     |
| --bp-sm     | 640px  | phablet | Two-column grids start here; icon-rail sidebar           |
| --bp-md     | 900px  | tablet  | Existing shell grid kicks in; card grids fill width      |
| --bp-lg     | 1100px | desktop | Labelled sidebar, multi-column content, context panels   |
| (optional)  | 1400px | wide    | max-width cap on main area; context panel widens          |

Currently `--bp-md: 768px` and `--bp-lg: 1100px` are defined in `app.css`, but the shell uses 900px/1100px in media queries. We should align these by adding `--bp-sm: 640px` and changing `--bp-md` to `900px`.

---

## 3. Design Tokens That Should Scale by Breakpoint

These values should shift in `app.css` `:root` or via media queries:

```css
/* Phone (default) */
--sp-outer: 16px;   /* page outer padding */
--sp-card: 16px;    /* card inner padding */
--sp-gap: 14px;     /* card grid gap */
--fs-page-title: var(--fs-xl);   /* 22px */

/* Tablet (>=900px) */
--sp-outer: 24px;
--sp-card: 20px;
--sp-gap: 18px;

/* Desktop (>=1100px) */
--sp-outer: 32px;
--sp-card: 24px;
--sp-gap: 24px;
--fs-page-title: var(--fs-2xl);  /* 28px */
```

Touch target rule: `--touch: 48px` stays constant at all breakpoints (field workers use tablets outdoors).

Font scale:

| Token     | Phone  | Tablet | Desktop |
|-----------|--------|--------|---------|
| --fs-sm   | 13px   | 13px   | 13px    |
| --fs-md   | 15px   | 15px   | 15px    |
| --fs-lg   | 17px   | 17px   | 18px    |
| --fs-xl   | 22px   | 22px   | 22px    |
| --fs-2xl  | 28px   | 28px   | 32px    |

---

## 4. AppShell Layout

Current shell CSS vars:
- `--sidebar-w: 240px` (labelled, desktop)
- `--sidebar-rail-w: 72px` (icon-only, tablet/collapsed)
- `--context-w: 400px` (right panel, optional)

### Phone (<640px)
```
+-----------------------------------------+
| Top bar (hamburger | brand | user menu)  |
+------------------------------------------+
| WeatherBar                               |
+------------------------------------------+
| Main content (full width, 16px padding)  |
| ...                                      |
+------------------------------------------+
| Footer (offline badge + version)         |
+------------------------------------------+
[Nav drawer slides in from left on burger press]
```

### Phablet (640–899px) — NEW
```
+------+-----------------------------------+
| Rail | WeatherBar                        |
| 72px +-----------------------------------+
|      | Main content (padding: 20px 24px) |
| Nav  | ...                               |
| Rail +-----------------------------------+
|      | Footer                            |
+------+-----------------------------------+
```
- Shell switches to 2-col CSS grid at 640px (currently 900px)
- This eliminates the top hamburger drawer for common tablet widths

### Tablet (900–1099px)
Same as phablet. Rail sidebar. Context panel hidden unless explicitly shown (same as today).

### Desktop (>=1100px)
```
+---------+---------------------------+--------+
| Sidebar | WeatherBar                | [ctx]  |
| 240px   +---------------------------+ 400px  |
|         | Main (max-width: 1400px)  |        |
| (Nav    | ...                       | [opt]  |
| labels) +---------------------------+        |
|         | Footer                    |        |
+---------+---------------------------+--------+
```
Context panel shown only when route provides a `context` snippet (currently only `/app`).

---

## 5. Page-by-Page Layout Sketches

### 5a. Login / Register / Forgot Password (unauthenticated)

**Phone**: Centered card, full-width form, road-SVG background. Current state is good.
**Tablet+**: Card centers at max-width 440px. Background SVG scales. No changes needed.

---

### 5b. Dashboard Home (/dashboard)

**Phone**:
```
[Verify banner (if needed)]
[Stats row: auto-fit minmax(140px,1fr)]
[Job Sites section header]
[Job Site card]
[Job Site card]
...
[Onboarding prompt if no sites]
```

**Tablet (900–1099px)**:
```
[Verify banner]
[Stats row: 4 cols fixed]
[Job Sites: 2-col card grid]
```

**Desktop (>=1100px)**:
```
[Verify banner]
[Stats row: 4 cols fixed, max 320px each]
[Job Sites: 2–3-col card grid depending on content width]
[Guides / quick-links sidebar block if context panel active]
```

Changes needed:
- Stats row: use explicit `repeat(4, 1fr)` at tablet+ instead of auto-fit
- Job site list: switch to 2-col grid at tablet+, 3-col at desktop

---

### 5c. Job Sites List (/dashboard/job-sites)

**Phone**: Single-column list of job-site cards, each 100% wide with tap-to-open.
**Tablet**: 2-col card grid.
**Desktop**: 2-col (large cards) or 3-col (compact list style). Sidebar/filter panel on right.

---

### 5d. Job Site Detail (/dashboard/job-sites/[id])

Current: Single-column tabs at all widths. Very wasteful on desktop.

**Phone**:
```
[Breadcrumb]
[Page header: title + status badge stacked]
[Action buttons row (full-width)]
[Tabs: scrollable horizontal]
[Tab content: full width]
```

**Tablet (900–1099px)**:
```
[Breadcrumb]
[Page header: title left | actions right]
[Tabs: normal row]
[Tab content: fills available width]
  - Overview tab: 2-col grid (details left, map right)
  - Logs tab: date filter sidebar + log entries list
```

**Desktop (>=1100px)**:
```
[Breadcrumb]
[Page header: title left | actions right]
[Persistent tab links in left mini-nav or top tabs]
[Tab content: max-width 1100px centered]
  - Overview: 3-col grid (details | map | status/actions)
  - Daily Logs: filters sidebar (240px) + log list
  - Settings: 2-col form layout
```

Changes needed:
- Page header: stack on phone, flex-row at tablet+
- Overview tab: introduce 2-col grid at tablet, 3-col at desktop
- The `flex-wrap: wrap` pattern in .page-header already works; confirm no min-width causes overflow at 375px

---

### 5e. Quick Calc (/app)

Currently has a custom 3-col layout at 1320px. The phone swipe-nav for tool switching is correct.

**Phone**:
```
[JobBar (inputs at top)]
[Tool stage (selected calc card, full-width)]
  Swipe left/right to switch tools
[Bottom: ToolList chips]
[CalcHistoryLog drawer]
```

**Tablet (900–1319px)** — IMPROVEMENT:
```
+------------------+---------------------+
| ToolList (left)  | Active tool stage   |
| 200px fixed      | (flex 1)            |
+------------------+---------------------+
| JobBar spans full width at top          |
+-----------------------------------------+
```
- Show ToolList as a persistent left panel instead of hidden behind swipe at 900px+
- Remove swipe-nav at these widths (it's confusing when the panel is visible)

**Desktop (>=1320px)** (current layout, keep):
```
+----------+--------------+----------+
| ToolList | Stage        | Context  |
| --tl-w   | flex 1       | --ctx-w  |
+----------+--------------+----------+
```

---

### 5f. Crew Map (/dashboard/map, /app/crew-map)

**Phone**: Full-screen map, overlay buttons for controls.
**Tablet**: Map takes 60% width, crew list panel on right (320px).
**Desktop**: Map takes remaining width after sidebar, crew list panel (360px).

---

### 5g. Settings (/dashboard/settings)

**Phone**: Single-column form sections, stacked.
**Tablet**: 2-col form layout (label col 140px, input col flex 1) for wider inputs.
**Desktop**: Max-width 760px centered, 2-col form layout.

---

### 5h. Team (/dashboard/team)

**Phone**: Single-column member list, avatar + name + role + actions stacked/inline.
**Tablet**: Table-like layout with columns (avatar, name, role, status, actions).
**Desktop**: Same as tablet with wider action columns.

---

### 5i. Admin (/dashboard/admin)

**Phone**: Stacked panels.
**Tablet+**: 2-col grid (nav panel left 200px, content right).
**Desktop**: Wider content area, stat cards in row.

---

## 6. Density Rules Per Breakpoint

| Property              | Phone   | Tablet (900px) | Desktop (1100px) |
|-----------------------|---------|----------------|-----------------|
| Outer page padding    | 16px    | 24px           | 32px            |
| Card inner padding    | 16px    | 20px           | 24px            |
| Card gap              | 12px    | 16px           | 20px            |
| Section margin-bottom | 20px    | 24px           | 32px            |
| Page title font       | 22px    | 22px           | 28px            |
| Touch target minimum  | 48px    | 48px           | 44px (desktop, mouse pointer) |
| Input height          | 48px    | 48px           | 44px            |
| Sidebar width         | drawer  | 72px rail      | 240px labels    |
| Max content width     | 100%    | 100%           | 1400px          |

Note: touch targets drop to 44px on desktop because mouse precision makes 48px unnecessary and it wastes vertical space in dense forms.

---

## 7. Component-Level Responsive Patterns

### CalcCard
- Phone: full-width, padding 16px, font-size: var(--fs-md)
- Tablet+: min-width 300px, padding 20px, auto-fit columns when in a grid container

### NumberField
- Phone: full-width, min-height 48px
- Desktop: inline in 2-col form grid, min-height 44px

### WeatherBar
- Phone: horizontal scroll if too many items; show 3 items max
- Tablet+: show all items; no scroll needed

### NavSidebar
- Phone: top bar (48px) + full-screen drawer
- Phablet/Tablet (640–1099px): 72px icon rail, always visible
- Desktop (1100px+): 240px labelled sidebar; collapsible to 72px rail

### Stats / metric cards
- Phone: auto-fit minmax(140px, 1fr) — 2 per row on 375px phone
- Tablet: 4 per row fixed
- Desktop: 4 per row with larger padding

---

## 8. Implementation Priority

1. **High** — Align shell breakpoints: add `--bp-sm: 640px`, change `--bp-md` to `900px` in `app.css`; trigger icon-rail at 640px instead of 900px.
2. **High** — Job Site detail overview tab: 2-col grid at tablet, 3-col at desktop (removes dead space on desktop).
3. **High** — Quick Calc persistent ToolList panel at 900px+ (phablet/tablet usability).
4. **Medium** — Dashboard home: explicit 4-col stats row and 2-col job sites grid at tablet+.
5. **Medium** — Settings and Team pages: 2-col form/table layout at tablet+.
6. **Low** — Density tokens: scale card padding and section spacing per breakpoint.
7. **Low** — WeatherBar: cap visible items on phone, expand on tablet+.

---

## 9. Testing Checklist

- [ ] 375px (iPhone SE) — no horizontal scroll, all touch targets >=48px
- [ ] 390px (iPhone 14) — same, plus landscape 844px looks like tablet
- [ ] 768px (iPad portrait) — icon-rail sidebar visible, 2-col content where applicable
- [ ] 1024px (iPad landscape) — same, content fills width
- [ ] 1280px (desktop) — labelled sidebar, multi-col content, no orphaned whitespace
- [ ] 1440px (wide desktop) — max-width cap respected, context panel shows for /app

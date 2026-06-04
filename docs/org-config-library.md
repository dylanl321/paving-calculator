# Org-Level Mix Library, Custom Materials, and Extended Defaults

**Status:** Design doc — do not implement until this doc is approved.

---

## 1. Overview

Today orgs can override a small whitelist of global constants and simple defaults (road width, waste%, etc.) stored as a single JSON blob in `organizations.overrides`. That is sufficient for one-off field tweaks but not for managing reusable mix presets or custom material types.

This design adds three new capabilities:

1. **Org Mix Library** — named mix presets owned by an org, reusable across job sites.
2. **Org Material Library** — custom material types (and density overrides for built-ins) per org.
3. **Extended Defaults** — more org-level operational defaults beyond the current whitelist.

---

## 2. Inheritance Chain

Priority runs high to low. A value is resolved by walking down the chain and taking the first defined value:

```
1. Manual calculator input (user explicitly typed a value this session)
2. Job-site mix config  (field on job_production_mixes row)
3. Org mix library      (org_mix_presets row linked from the job-site mix)
4. Org overrides        (organizations.overrides JSON — existing layer)
5. paverate.yaml global (static config, never null)
```

For materials the chain is:

```
1. Job-site explicit entry
2. Org material library (org_materials) — can override density for a built-in ID
3. paverate.yaml materials array
```

The resolver already exists (`makeResolver` in `overrides.ts`). It will be extended to accept the org mix library and org materials as additional inputs, keeping the same pattern: everything is optional, missing = fall through to the next layer.

---

## 3. Schema Design

### 3.1 `org_mix_presets`

Reusable mix definitions owned by an org. A row here is a template; `job_production_mixes` rows reference it via `preset_id` (nullable FK).

```sql
CREATE TABLE org_mix_presets (
  id                TEXT    PRIMARY KEY,          -- cuid2
  org_id            TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name              TEXT    NOT NULL,              -- "9.5mm Superpave Surface"
  mix_type          TEXT,                          -- e.g. "9.5mm SP" (free text or enum)
  design_spread_rate  REAL,                        -- lbs/SY
  design_thickness_in REAL,                        -- inches
  tack_type         TEXT,                          -- tack product / binder grade
  tack_rate_gsy     REAL,                          -- gal/SY
  plant_supplier    TEXT,                          -- "APAC Atlanta Plant 4"
  notes             TEXT,
  source_preset_id  TEXT REFERENCES org_mix_presets(id) ON DELETE SET NULL,
                                                   -- non-null if cloned from another preset
  is_global_starter INTEGER NOT NULL DEFAULT 0,    -- 1 = shipped from paverate.yaml, read-only
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_by        TEXT    REFERENCES users(id)   ON DELETE SET NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_org_mix_presets_org   ON org_mix_presets(org_id);
CREATE INDEX idx_org_mix_presets_sort  ON org_mix_presets(org_id, sort_order);
```

`is_global_starter = 1` rows are seeded server-side from `paverate.yaml` starters (see section 5). Orgs cannot edit or delete starter rows — they clone them (`source_preset_id` points back to the starter). The API enforces this.

#### Linking to job_production_mixes

Add a nullable FK on the existing table:

```sql
ALTER TABLE job_production_mixes ADD COLUMN preset_id TEXT
  REFERENCES org_mix_presets(id) ON DELETE SET NULL;
```

When a user picks a preset while creating a job site, `preset_id` is set and the design fields (`mix_type`, `target_thickness_in`, `target_spread_rate`, `tack_type`, `target_tack_rate`) are pre-populated from the preset. After that they are independent — editing the preset does not retroactively change existing job-site mixes.

---

### 3.2 `org_materials`

Custom or overridden materials per org.

```sql
CREATE TABLE org_materials (
  id                 TEXT    PRIMARY KEY,           -- cuid2
  org_id             TEXT    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  builtin_id         TEXT,                          -- non-null = overrides a paverate.yaml MAT.* entry
  name               TEXT    NOT NULL,              -- display label
  category           TEXT    NOT NULL               -- 'aggregate' | 'asphalt' | 'soil' | 'concrete'
                     CHECK  (category IN ('aggregate','asphalt','soil','concrete')),
  density_tons_per_yd3 REAL  NOT NULL,
  supplier           TEXT,
  notes              TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,    -- soft-delete
  created_by         TEXT    REFERENCES users(id)   ON DELETE SET NULL,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (org_id, builtin_id)                       -- only one override per built-in per org
);

CREATE INDEX idx_org_materials_org ON org_materials(org_id);
```

If `builtin_id IS NOT NULL` this row overrides the density (and optionally the label) of a built-in `MAT.*` entry from `paverate.yaml`. If `builtin_id IS NULL` this is a brand-new material that lives only in the org library.

The material resolver merges: org overrides for built-ins take precedence; org-custom materials are appended. Built-ins that have no org override are returned unchanged.

---

### 3.3 Extended Defaults (organizations.overrides extension)

No new table needed. The `OrgDefaultsOverride` interface in `overrides.ts` is extended and the same JSON blob is used. New fields:

```typescript
interface OrgDefaultsOverride {
  // --- existing ---
  roadWidthFt?: number;
  truckLoadTons?: number;
  machine?: string;
  firstPass?: boolean;
  tackApplication?: string;
  wastePct?: number;
  courseType?: string;
  liftThicknessIn?: number;
  mixType?: string;

  // --- new ---
  plantSupplier?: string;          // default plant/supplier name
  crewSize?: number;               // default crew headcount (1-50)
  pavingWindowStartHour?: number;  // 0-23, hour of day paving starts
  pavingWindowEndHour?: number;    // 0-23, hour of day paving must end
  minPavingTempF?: number;         // minimum ambient temp for placement (F)
  maxPavingTempF?: number;         // maximum ambient temp (F, rarely used but included)
  compactionSpec?: string;         // free text, e.g. "92% of TMD per GDOT 400"
}
```

Validation rules to add to `OVERRIDABLE_DEFAULTS`:

| Key                   | Type   | Min | Max |
|-----------------------|--------|-----|-----|
| plantSupplier         | string | -   | -   |
| crewSize              | number | 1   | 50  |
| pavingWindowStartHour | number | 0   | 23  |
| pavingWindowEndHour   | number | 0   | 23  |
| minPavingTempF        | number | 20  | 80  |
| maxPavingTempF        | number | 60  | 130 |
| compactionSpec        | string | -   | -   |

No migration required. The overrides blob is schemaless JSON; new keys are simply ignored by old code.

---

## 4. API Endpoints

All endpoints live under `/api/org/` and require an authenticated org member. Admin-only routes require `role = admin`.

### Mix Library

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/api/org/mix-presets` | member | List all presets for the calling user's org, including global starters |
| POST   | `/api/org/mix-presets` | admin  | Create a new preset |
| GET    | `/api/org/mix-presets/:id` | member | Fetch a single preset |
| PUT    | `/api/org/mix-presets/:id` | admin  | Update a preset (not allowed on `is_global_starter = 1`) |
| DELETE | `/api/org/mix-presets/:id` | admin  | Delete (not allowed on `is_global_starter = 1`) |
| POST   | `/api/org/mix-presets/:id/clone` | admin | Clone a preset (sets `source_preset_id`) |

GET `/api/org/mix-presets` response shape:

```json
{
  "starters": [ { "id": "...", "name": "9.5mm Superpave Surface", ... } ],
  "custom":   [ { "id": "...", "name": "Our Local Base Mix", ...       } ]
}
```

Starters are injected at read time from `paverate.yaml` (not stored as DB rows). If an org has cloned a starter, the clone appears in `custom` with `source_preset_id` pointing at the starter's synthetic ID.

### Material Library

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET    | `/api/org/materials` | member | List org materials + merged built-ins |
| POST   | `/api/org/materials` | admin  | Add a new material or create a built-in density override |
| PUT    | `/api/org/materials/:id` | admin  | Update name/density/notes |
| DELETE | `/api/org/materials/:id` | admin  | Soft-delete (`is_active = 0`) |

GET `/api/org/materials` response shape:

```json
{
  "materials": [
    {
      "id": "MAT.GAB",
      "name": "GAB (Graded Aggregate Base)",
      "category": "aggregate",
      "densityTonsPerYd3": 1.45,
      "source": "org_override",
      "orgMaterialId": "cm_..."
    },
    {
      "id": "MAT.CRUSHER_RUN",
      "name": "Crusher Run",
      "category": "aggregate",
      "densityTonsPerYd3": 1.5,
      "source": "builtin"
    },
    {
      "id": "cm_abc123",
      "name": "Recycled Millings",
      "category": "asphalt",
      "densityTonsPerYd3": 1.45,
      "supplier": "On-site reclaim",
      "source": "org_custom"
    }
  ]
}
```

The `source` field lets the UI badge org-defined entries distinctly.

### Extended Defaults

Extended defaults are part of the existing `/api/org/settings` endpoint. No new route is needed — just update the `OrgDefaultsOverride` type and `OVERRIDABLE_DEFAULTS` whitelist.

---

## 5. Global Starter Mixes (paverate.yaml)

Add a top-level `starterMixes` section to `paverate.yaml`. These are injected as read-only presets on every org's mix library page. Orgs clone them to customise.

Proposed starters covering GDOT common course types (from existing `courseType`/`spreadTolerance` entries):

```yaml
starterMixes:
  - id: STARTER.SURFACE_9_5
    name: "9.5mm Superpave Surface"
    mix_type: "9.5mm SP"
    design_spread_rate: 110       # lbs/SY (GDOT Table 10 mid-range for 1.5" lift)
    design_thickness_in: 1.5
    tack_type: "CRS-2"
    tack_rate_gsy: 0.05
  - id: STARTER.BINDER_19
    name: "19mm Superpave Binder"
    mix_type: "19mm SP"
    design_spread_rate: 165
    design_thickness_in: 2.5
    tack_type: "CRS-2"
    tack_rate_gsy: 0.05
  - id: STARTER.BASE_25
    name: "25mm Superpave Base"
    mix_type: "25mm SP"
    design_spread_rate: 220
    design_thickness_in: 3.0
    tack_type: "CRS-2"
    tack_rate_gsy: 0.05
  - id: STARTER.OGFC
    name: "Open-Graded Friction Course (OGFC)"
    mix_type: "OGFC"
    design_spread_rate: 95
    design_thickness_in: 1.25
    tack_type: "Tack-on-Asphalt"
    tack_rate_gsy: 0.05
  - id: STARTER.BASE_AC
    name: "Asphaltic Concrete Base"
    mix_type: "AC Base"
    design_spread_rate: 300
    design_thickness_in: 4.5
    tack_type: "CRS-2"
    tack_rate_gsy: 0.04
```

Spread rates above are approximate mid-range values for reference and are clearly labeled as starters. Orgs are expected to clone and adjust before production use.

---

## 6. UI Wireframes (text description)

### 6.1 Org Settings — Mix Library Tab

```
Settings > Mix Library

[ + New Mix ]  [ Expand Starters ]

GLOBAL STARTERS (read-only)
┌─────────────────────────────────────────────────────────────────┐
│  9.5mm Superpave Surface       110 lbs/SY · 1.5 in  [ Clone ]  │
│  19mm Superpave Binder         165 lbs/SY · 2.5 in  [ Clone ]  │
│  25mm Superpave Base           220 lbs/SY · 3.0 in  [ Clone ]  │
│  OGFC                           95 lbs/SY · 1.25 in [ Clone ]  │
│  Asphaltic Concrete Base       300 lbs/SY · 4.5 in  [ Clone ]  │
└─────────────────────────────────────────────────────────────────┘

YOUR ORG'S MIXES
┌─────────────────────────────────────────────────────────────────┐
│  19mm Binder (Our Mix) ↗ from Starter  165 lbs/SY  [ Edit ] [ Delete ] │
│  Recycled Base — Local Plant           195 lbs/SY  [ Edit ] [ Delete ] │
└─────────────────────────────────────────────────────────────────┘
```

- Tapping a row expands to show all fields (mix_type, tack_type, tack_rate, plant, notes).
- "Clone" copies the starter into "Your Org's Mixes" and opens the edit drawer.
- Touch targets 48px min. Edit drawer is a bottom sheet on mobile.

### 6.2 Org Settings — Materials Tab

```
Settings > Materials

[ + Add Material ]

BUILT-IN MATERIALS
┌──────────────────────────────────────────────────────────────────┐
│  GAB (Graded Aggregate Base)   1.45 t/yd³  [override]  [ Edit ] │  ← org has overridden
│  Crusher Run                   1.50 t/yd³  (global)             │
│  #57 Stone                     1.40 t/yd³  (global)             │
│  ...                                                             │
└──────────────────────────────────────────────────────────────────┘

CUSTOM MATERIALS
┌──────────────────────────────────────────────────────────────────┐
│  Recycled Millings (asphalt)  1.45 t/yd³  ACME Milling  [ Edit ] [ Remove ] │
└──────────────────────────────────────────────────────────────────┘
```

- Editing a built-in shows a density override field, with the global value grayed as placeholder.
- "Remove" on a custom material is a soft-delete; it shows a confirmation chip ("Removed — Undo").

### 6.3 Job Site Creation — Mix Picker

When adding a mix on the job site creation / setup form:

```
Add Mix

  Name:   [___________________]  or  [ Pick from library ▼ ]

        ┌ Library Picker (bottom sheet) ──────────────┐
        │  YOUR ORG'S MIXES                           │
        │  > 19mm Binder (Our Mix)  165 lbs/SY       │
        │  > Recycled Base          195 lbs/SY        │
        │  GLOBAL STARTERS                            │
        │  > 9.5mm Surface          110 lbs/SY        │
        │  ...                                        │
        └─────────────────────────────────────────────┘

  Spread rate:     [ 165    ] lbs/SY   ← pre-filled from preset, editable
  Thickness:       [ 2.5    ] in
  Tack type:       [ CRS-2  ]
  Tack rate:       [ 0.05   ] gal/SY
  Plant/supplier:  [ APAC Plant 4 ]    ← pre-filled from org default
```

Picking a preset pre-populates the fields but they remain editable (the job-site copy is independent of the preset after creation).

### 6.4 Org Settings — Extended Defaults

Extends the existing Defaults section with new fields, grouped under "Operations":

```
Settings > Defaults > Operations

  Default plant / supplier:   [ ________________________ ]
  Default crew size:          [ 8  ]  workers
  Paving window:              [ 07 ] : 00  to  [ 18 ] : 00
  Min paving temp:            [ 50 ] °F
  Max paving temp:            [ 110] °F
  Compaction spec:            [ 92% of TMD per GDOT 400 ]
```

---

## 7. Inheritance Logic (resolver changes)

The existing `makeResolver(overrides?)` in `overrides.ts` returns a `ConfigResolver`. It will be extended to accept two optional extra inputs:

```typescript
interface LibraryInputs {
  orgMixPresets?: OrgMixPreset[];    // from org_mix_presets
  orgMaterials?: OrgMaterial[];      // from org_materials
}

function makeResolver(
  overrides?: OrgOverrides | null,
  library?: LibraryInputs
): ConfigResolver
```

New resolver methods:

```typescript
// Return a preset by id, or null.
resolver.mixPreset(id: string): OrgMixPreset | null

// Return the full merged material list:
// built-ins with org density overrides applied, plus org-custom entries appended.
resolver.materials(): MergedMaterial[]

// Return a single material by id (MAT.* or org cuid2).
resolver.material(id: string): MergedMaterial | null
```

`calcContext.svelte.ts` loads org mix presets and materials alongside the existing overrides when an org session is active, passes them to `makeResolver`, and exposes `ctx.materials()` and `ctx.mixPreset(id)` for use in calculators.

No calculator formulas change. The only change is that the material density input comes from `ctx.material(id).densityTonsPerYd3` instead of directly from `config.materials`.

---

## 8. Permissions

| Action | Required role |
|--------|--------------|
| View mix library / materials | member |
| Create / edit / delete mix presets | admin |
| Create / edit / delete org materials | admin |
| Clone a starter preset | admin |
| Edit extended defaults | admin |

Enforced server-side via existing `requireOrgRole('admin', ...)` helper.

---

## 9. Open Questions

1. **Starter mix IDs** — Should global starters be synthetic IDs injected at runtime (no DB row), or seeded once into `org_mix_presets` as `is_global_starter = 1` rows? Runtime injection is simpler but makes "clone" logic more complex. DB rows are heavier but easier to query. This doc assumes runtime injection but the migration is written to support DB rows if preferred.

2. **Multi-org per user** — Current schema assumes one org per user. Mix presets are org-scoped; if multi-org ever ships, the mix picker will need an org selector context.

3. **Starter spread rate values** — The values in section 5 are mid-range GDOT Table 10 estimates. They should be reviewed by the team before shipping to ensure they reflect the orgs' actual mix designs.

4. **Version / audit log** — Should edits to presets track history (who changed what, when)? The `created_by` / `updated_at` columns are minimal. A full audit log can be added later via the existing audit infrastructure (`admin_audit_log`).

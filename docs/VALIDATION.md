# Calculation Validation System

This document defines **how every number the app produces is tied back to an
authoritative source** — and how we keep that tie accurate as specifications
change over time. The goal is not to validate everything in one sitting, but to
have a **repeatable, auditable process** so that at any moment we can answer:

> "Where does this formula / constant / rate come from, and has it been
> verified against the current GDOT spec?"

---

## 1. Why this exists

The app does math that affects real material orders, spec compliance, and
inspection pass/fail. A wrong constant (e.g. a tack rate or a layer-thickness
limit) can cause a rejected lot or a mis-order worth thousands. So **no value
ships "because the field card said so"** — every value carries a traceable
citation and a verification status.

---

## 2. Source hierarchy (authority order)

When two sources disagree, the **higher** source wins.

| Tier | Source | Role | Location |
|------|--------|------|----------|
| 1 | **GDOT 2021 Standard Specifications** | Primary authority for materials, rates, thickness, methods | `docs/2021StandardSpecifications.pdf` |
| 2 | **GDOT 2021 Supplemental Specifications (2024 Edition)** | Amendments/overrides to specific sections of Tier 1 | `docs/2021Supplemental Specifications 2024 Edition.pdf` |
| 3 | **GDOT Construction Manual (cm001)** | Procedures, inspection, density/acceptance practice | `docs/cm001.pdf` |
| 4 | **GDOT ROADS portal (online, current)** | Confirms which edition/supplement is in force | https://www.dot.ga.gov/GDOT/Pages/designmanualssoftware.aspx |
| 5 | **Field reference card** | Convenience math / rules-of-thumb only | `docs/reference-images/field-formula-card.jpeg` |

> **Rule:** Tier 5 (field card) may be used for *quick-estimate* formulas (e.g.
> `thickness × 110`, stick-check `× 1.2`, truck-load `18.5 t`) but those must be
> **labeled in the app as field estimates**, not spec values. Anything that maps
> to a compliance decision (tack rates, layer thickness, temperature, density
> acceptance) must trace to Tier 1–3.

The Supplemental (Tier 2) **amends** the Standard Specs. Always check whether a
Standard-Spec section has been superseded by the Supplemental before marking a
value verified.

---

## 3. Relevant GDOT sections (verification map)

These are the spec sections each app value is expected to live in. The exact
clause/table/page is filled in during verification (see the matrix in
`docs/validation-matrix.md`). Section numbers follow GDOT's standard numbering;
**confirm each against the PDF** before marking verified.

| App area | Expected GDOT section(s) | What to confirm |
|----------|--------------------------|------------------|
| Tack / bituminous tack coat rates | **Section 413** (Bituminous Tack Coat); emulsion materials in **Section 820** | Application-rate table (gal/yd²) by surface type; the OGFC/PEM interstate restriction |
| Hot mix asphaltic concrete (mix types, layer thickness) | **Section 400 / 828** (HMA, Superpave) | Min/max layer + total thickness per mix (our Table 5) |
| Placement temperature vs. lift thickness | **Section 400** (weather/seasonal limitations) | Min air temperature by lift thickness (our Table 4) |
| Soil-cement / soil-aggregate base | **Section 301 / 303** | Cement content, density/compaction acceptance |
| Graded Aggregate Base (GAB) | **Section 310** | Density acceptance, target densities |
| Density / compaction acceptance | **Construction Manual + Section 300-series** | % of max dry density target, test method |
| Spread-rate / tonnage geometry math | (universal mensuration) | No spec needed — pure geometry; verify arithmetic only |

> Section numbers above are the **starting points** to search in the PDFs. The
> verification step replaces each with the exact section + table + page that is
> actually in force in the 2021 Standard + 2024 Supplemental.

---

## 4. The validation matrix (single source of truth)

Every value lives as one row in **`docs/validation-matrix.md`** with:

- **ID** — stable key (e.g. `TACK.NEW_AC`, `THICK.SUPERPAVE_19MM`, `CONST.LB_PER_TON`)
- **Value / formula** — exactly as used in the app
- **Source tier** — 1–5 from §2
- **Citation** — document + section + table + page (e.g. "Std Spec §413.3.05, Table 1, p. 412")
- **Status** — see §5
- **Verified by / date** — who confirmed and when
- **Notes** — supplemental overrides, caveats, field-estimate flags

The app reads this matrix (or a JSON export of it) so that each calculator can
show a **"source" link** and a **verification badge** next to its result.

---

## 5. Verification statuses

Each value carries exactly one status:

| Status | Meaning | App treatment |
|--------|---------|---------------|
| ✅ `VERIFIED` | Confirmed against the cited Tier 1–3 spec, edition checked | Show normally, "spec-verified" badge |
| 🟡 `FIELD_ESTIMATE` | From the field card (Tier 5); a convenience value, not spec | Show with "field estimate" label |
| 🟠 `UNVERIFIED` | Transcribed but not yet checked against the PDF | Usable, but flagged "pending verification" in an about/debug view |
| 🔴 `CONFLICT` | Source disagreement or superseded by Supplemental | Block or warn until resolved |
| ⚪ `N/A` | Pure math/geometry, no spec needed | Show normally |

**Today's baseline:** all GDOT-table values transcribed from the photos start as
🟠 `UNVERIFIED`; the field-card formulas start as 🟡 `FIELD_ESTIMATE`; geometry
is ⚪ `N/A`. Verification moves rows to ✅ over time.

---

## 6. The verification procedure (repeatable)

For each matrix row, to move it from 🟠 → ✅:

1. **Open the cited PDF** (`docs/2021StandardSpecifications.pdf`, etc.).
2. **Locate the section/table** named in the row (start from §3's map).
3. **Check the Supplemental** (`...2024 Edition.pdf`) for an amendment to that
   same section. If amended, the Supplemental value wins.
4. **Compare** the app value/formula to the spec value, unit-for-unit.
5. **Record** the exact citation (section + table + page) and set status:
   - matches → ✅ `VERIFIED`
   - differs → 🔴 `CONFLICT`, open an issue, fix the app value or relabel
6. **Stamp** verified-by + date.
7. **Confirm edition currency** once per review cycle via the ROADS portal
   ([GDOT Design Manuals & Software](https://www.dot.ga.gov/GDOT/Pages/designmanualssoftware.aspx))
   — make sure the 2021 Standard + 2024 Supplemental are still the in-force set.

> **Tooling (installed & working):** `pypdf` is installed and
> `tools/spec_search.py` searches/dumps the GDOT PDFs (all three have a real
> text layer). Use it to find sections and pull quotable excerpts into
> `docs/spec-excerpts/`, which become the evidence cited in the matrix.
>
> ```
> python tools/spec_search.py "tack coat" --pdf std   # find a topic
> python tools/spec_search.py --page std 459          # dump a specific page
> ```
>
> **Page-number quirk:** the PDF page index is offset from the printed footer
> page number (e.g. printed p. 449 = PDF page 459 in the Standard Specs).
> Citations record the **printed** page; `--page` takes the **PDF** page. A full
> search across the 2,050-page Standard Specs takes ~30 s, so prefer dumping a
> known page range once the section is located.

---

## 7. Change management (keeping it valid over time)

- **Edition watch:** GDOT issues Supplemental Specifications periodically. Re-run
  §6 step 7 each cycle; when a new Supplemental drops, re-verify any row whose
  section it touches.
- **Single-writer rule:** app code must **never** hardcode a spec value that
  isn't represented by a matrix ID. New calc → new matrix row first.
- **CI guard (future):** a test that fails if the app references a constant ID
  that is missing from the matrix, or whose status is 🔴 `CONFLICT`.
- **Provenance in the UI:** every spec-derived result links to its citation so a
  field user or inspector can tap "why?" and see the source.

---

## 8. Recommended repo structure for validation

```
docs/
├── VALIDATION.md                 ← this document (the system)
├── validation-matrix.md          ← every value → citation + status
├── 2021StandardSpecifications.pdf (Tier 1)
├── 2021Supplemental ... .pdf      (Tier 2)
├── cm001.pdf                      (Tier 3, Construction Manual)
└── spec-excerpts/                 ← extracted, quotable text of cited sections
    ├── 413-tack-coat.md
    ├── 400-hma-thickness-temp.md
    ├── 301-soil-cement.md
    └── 310-gab-density.md
```

The `spec-excerpts/` folder is what makes future validation fast: extract once,
quote forever, and the matrix points at both the PDF (authority) and the excerpt
(evidence).

---

## 9. What is and isn't validated right now

- **Arithmetic / algebra:** ✅ already validated by hand — see
  `docs/WORKFLOW.md` Appendix A. Every formula is dimensionally and numerically
  self-consistent.
- **Spec values (tack rates, thickness, temperature, density):** in progress.
  - ✅ **Tack coat (Section 413)** — VERIFIED 2026-06-01; matches exactly.
    Evidence: `docs/spec-excerpts/413-tack-coat.md`. New rule found: no emulsion
    below 40°F (§413.3.05.A).
  - ✅ **Lift-thickness temperature (Table 4) + mix-type thickness (Table 5),
    Section 400** — VERIFIED 2026-06-01; all rows match. Evidence:
    `docs/spec-excerpts/400-hma-thickness-temp.md`. New rule found: OGFC/PEM
    placement floor 60°F (§400.3.05.E). Fixed two transcription footnote-marker
    errors in `GDOT_TABLES.md`.
  - 🟠 Soil-cement (Section 301), GAB (Section 310), density acceptance — still
    transcribed-only / rules-of-thumb; next to verify with the same procedure.
- **Field-card formulas (×110, ×1.2, 18.5 t, machine retention):** 🟡
  `FIELD_ESTIMATE` — correct as rules-of-thumb, labeled as such, not spec.

This gives a clear, honest picture and a defined path to full verification
whenever we choose to walk it.

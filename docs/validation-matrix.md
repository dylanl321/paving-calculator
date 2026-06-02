# Validation Matrix

Single source of truth mapping **every value the app uses** to its source and
verification status. See [`VALIDATION.md`](VALIDATION.md) for the process,
source hierarchy, and status definitions.

**Status legend:** ✅ VERIFIED · 🟡 FIELD_ESTIMATE · 🟠 UNVERIFIED · 🔴 CONFLICT · ⚪ N/A
**Tier legend:** 1 = Std Spec · 2 = Supplemental · 3 = Construction Manual · 4 = ROADS portal · 5 = Field card

> Citations are filled in as rows are verified (see VALIDATION.md §6). Section
> numbers shown are **expected** starting points to confirm against the PDFs.

---

## Constants

| ID | Value | Tier | Citation | Status | Verified | Notes |
|----|-------|:----:|----------|:------:|----------|-------|
| `CONST.SF_PER_SY` | 9 sq ft / sq yd | — | geometry | ⚪ N/A | — | Universal |
| `CONST.LB_PER_TON` | 2,000 lb / ton | — | definition | ⚪ N/A | — | US short ton |
| `CONST.CF_PER_CY` | 27 cu ft / cu yd | — | geometry | ⚪ N/A | — | Universal |
| `CONST.WATER_LB_GAL` | 8.34 lb / gal | — | physics | ⚪ N/A | — | Water at ~60°F |
| `CONST.CEMENT_BAG` | 94 lb / bag | 1 | Std Spec §830 (portland cement) | 🟠 | — | Confirm bag standard |
| `CONST.TRUCK_LOAD` | 18.5 tons | 5 | Field card | 🟡 | — | Fleet rule-of-thumb; user-editable |
| `CONST.SHUTTLE_RETAIN` | 24 tons | 5 | Field card | 🟡 | — | Machine retention estimate |
| `CONST.PAVER_RETAIN` | 14 tons | 5 | Field card | 🟡 | — | Machine retention estimate |
| `CONST.THICK_MULT` | 110 lbs/SY per in | 5 | Field card | 🟡 | — | HMA unit-weight rule-of-thumb |
| `CONST.STICK_FACTOR` | 1.2× | 5 | Field card | 🟡 | — | Loose-vs-compacted estimate |
| `CONST.COMPACTION_TARGET` | 95–100% max dry density | 1/3 | Std Spec 300-series + Constr. Manual | 🟠 | — | Project-specific; confirm |

---

## Formulas (algebra verified; spec linkage where applicable)

| ID | Formula | Tier | Citation | Status | Notes |
|----|---------|:----:|----------|:------:|-------|
| `CALC.SQ_YARDS` | L×W÷9 | — | geometry | ⚪ N/A | Math-verified (WORKFLOW App. A) |
| `CALC.SPREAD_PLACED` | (Tons−Retain)×2000 ÷ SY | 5 | Field card | 🟡 | Retention is Tier 5 estimate |
| `CALC.SPREAD_THICK` | in × 110 | 5 | Field card | 🟡 | Quick estimate only |
| `CALC.REMAINING_DIST` | Tons×2000×9 ÷ (W×Rate) | — | geometry | ⚪ N/A | Math-verified |
| `CALC.FEET_TODAY` | (Ordered−Placed)×2000×9 ÷ (W×Rate) | — | geometry | ⚪ N/A | Math-verified |
| `CALC.TACK_GALLONS` | SY × ShotRate | — | geometry | ⚪ N/A | Rate value is the spec part → see TACK.* |
| `CALC.TONNAGE` | SY × Rate ÷ 2000 | — | geometry | ⚪ N/A | Math-verified |
| `CALC.STICK` | thickness × 1.2 | 5 | Field card | 🟡 | Field estimate |
| `CALC.SOIL_TONNAGE` | L×W×(D/12)×pcf ÷ 2000 | — | geometry | ⚪ N/A | Density value → see DENSITY.* |
| `CALC.SOIL_LBS_SY` | D × pcf × 0.75 | — | geometry | ⚪ N/A | Math-verified |
| `CALC.CEMENT_RATE` | SY × CementRate ÷ 2000 | — | geometry | ⚪ N/A | Cement % → see CEMENT.* |
| `CALC.CEMENT_PCT` | DrySoil × % | 1 | Std Spec §301 (cement content) | 🟠 | % range is spec/mix-design |
| `CALC.WATER_ADD` | DrySoil × (OMC−CMC) ÷ 8.34 | — | geometry | ⚪ N/A | OMC from Proctor |
| `CALC.COMPACTION` | FieldDry ÷ MaxDry × 100 | 1/3 | 300-series + Constr. Manual | 🟠 | Acceptance method |

---

## Tack Coat Rates (GDOT Table 2 → confirm Section 413/820)

| ID | Value | Tier | Citation | Status | Notes |
|----|-------|:----:|----------|:------:|-------|
| `TACK.NEW_AC` | 0.05–0.08 gal/yd² | 1 | Std Spec §413.3.05.B Table 2, p.449 ✅2026-06-01 | ✅ | New AC → New AC / thin-lift leveling |
| `TACK.AGED_LE25RAP` | 0.06–0.10 gal/yd² | 1 | Std Spec §413.3.05.B Table 2, p.449 ✅2026-06-01 | ✅ | ≤25% RAP to aged/milled |
| `TACK.AGED_GT25RAP` | 0.08–0.12 gal/yd² | 1 | Std Spec §413.3.05.B Table 2, p.449 ✅2026-06-01 | ✅ | >25% RAP to aged/milled |
| `TACK.OGFC_PEM_RESTRICTION` | No anionic/cationic under OGFC/PEM on interstates | 1 | Std Spec §413.3.05.B Table 2 note, p.449 ✅2026-06-01 | ✅ | Compliance rule |
| `TEMP.TACK_MIN` | No emulsion below 40°F air (shade); not on wet/frozen surface | 1 | Std Spec §413.3.05.A, p.449 ✅2026-06-01 | ✅ | **New** — tack-specific weather limit |
| `TACK.FIELD_LEVELING` | 0.040–0.060 gal/SY | 5 | Field card | 🟡 | Field range |
| `TACK.FIELD_OGI` | 0.060–0.080 gal/SY | 5 | Field card | 🟡 | Field range |
| `TACK.FIELD_ROCKCHIP` | 0.085 gal/SY | 5 | Field card | 🟡 | Field value |

---

## Lift Thickness vs. Min Temperature (GDOT Table 4 → confirm Section 400)

| ID | Lift | Min Temp | Tier | Citation | Status |
|----|------|----------|:----:|----------|:------:|
| `TEMP.LE_1IN` | ≤1 in | 55°F | 1 | Std Spec §400.3.05.E Table 4, p.382 | ✅ |
| `TEMP.1_2IN` | 1.1–2 in | 45°F | 1 | Std Spec §400.3.05.E Table 4, p.382 | ✅ |
| `TEMP.2_3IN` | 2.1–3 in | 40°F | 1 | Std Spec §400.3.05.E Table 4, p.382 | ✅ |
| `TEMP.3_4IN` | 3.1–4 in | 35°F | 1 | Std Spec §400.3.05.E Table 4, p.382 | ✅ |
| `TEMP.4_8IN` | 4.1–8 in | 32°F & rising | 1 | Std Spec §400.3.05.E Table 4, p.382 | ✅ |
| `TEMP.OGFC_PEM_MIN` | OGFC/PEM no place <60°F (55°F w/ MTV + Engineer) | 1 | Std Spec §400.3.05.E, p.382 | ✅ |

---

## Mix Type Layer/Total Thickness (GDOT Table 5 → confirm Section 400/828)

| ID | Mix | Min Layer | Max Layer | Max Total | Tier | Citation | Status |
|----|-----|-----------|-----------|-----------|:----:|----------|:------:|
| `THICK.SP_25MM` | 25 mm Superpave | 2½ in | 5 in* | — | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.SP_19MM` | 19 mm Superpave | 1¾ in | 3 in* | — | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.SP_125MM` | 12.5 mm Superpave | 1⅜ in | 2½ in**/*** | 8 in | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.SP_95_T2` | 9.5 mm SP Type 2 | 1⅛ in | 1½ in*** | 4 in | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.SP_95_T1` | 9.5 mm SP Type 1 | ⅞ in | 1¼ in | 4 in | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.MIX_475` | 4.75 mm Mix | ¾ in | 1⅛ in | 2 in | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.OGFC_95` | 9.5 mm OGFC | 75 lb/yd² | 95 lb/yd² | — | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.OGFC_125` | 12.5 mm OGFC | 85 lb/yd² | 110 lb/yd² | — | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.PEM_125` | 12.5 mm PEM | 110 lb/yd² | 165 lb/yd² | — | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.SMA_95` | 9.5 mm SMA | 1⅛ in | 1½ in | 4 in | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.SMA_125` | 12.5 mm SMA | 1⅜ in | 3 in | 6 in | 1 | §400.3.05.F Table 5, p.382 | ✅ |
| `THICK.SMA_19` | 19 mm SMA | 1¾ in | 3 in | — | 1 | §400.3.05.F Table 5, p.382 | ✅ |

---

## Spread-Rate Tolerance (GDOT Section 400 Table 12)

| ID | Course | Tolerance (± lbs/yd²) | Tier | Citation | Status |
|----|--------|-----------------------|:----:|----------|:------:|
| `TOLERANCE.BASE` | Asphaltic concrete base course | ±55 | 1 | Std Spec §400.4.A.2.b Table 12 | ✅ |
| `TOLERANCE.INTERMEDIATE_WEARING` | Intermediate / wearing course | ±27.5 | 1 | Std Spec §400.4.A.2.b Table 12 | ✅ |
| `TOLERANCE.OGFC` | 9.5 / 12.5 mm OGFC | within 7 (per lot) | 1 | Std Spec §400.4.A.2.b Table 12 note | ✅ |
| `TOLERANCE.PEM` | 12.5 mm PEM | within 10 (per lot) | 1 | Std Spec §400.4.A.2.b Table 12 note | ✅ |

> Table 12 also specifies **thickness** tolerances (base ±0.5 in, intermediate/wearing
> ±0.25 in). Only the **spread-rate** rows are wired into the app today (Spread Rate
> card "in spec" judgment). The "any combination of base + surface" row uses the
> base ±55 value. Replaces the prior flat ±5% heuristic, which had no spec basis.

---



| ID | Material | Typical pcf | Tier | Citation | Status |
|----|----------|-------------|:----:|----------|:------:|
| `DENSITY.SOIL_CEMENT` | Compacted soil-cement | 120–135 | 5 | Rule-of-thumb | 🟡 |
| `DENSITY.GAB` | Graded Aggregate Base | 135–145 | 5 | Rule-of-thumb; confirm §310 | 🟡 |
| `DENSITY.CRUSHED_STONE` | Crushed stone | 100–120 | 5 | Rule-of-thumb | 🟡 |
| `DENSITY.SAND` | Sand | 100–110 | 5 | Rule-of-thumb | 🟡 |
| `DENSITY.CLAY` | Compacted clay | 100–115 | 5 | Rule-of-thumb | 🟡 |
| `DENSITY.TOPSOIL` | Topsoil (loose) | 75–90 | 5 | Rule-of-thumb | 🟡 |

> All `DENSITY.*` values are starting defaults; project Proctor / mix-design
> values override and should be entered/stored per material in the app.

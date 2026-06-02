# Spec Excerpt — Section 400 Lift Thickness, Temperature & Mix Thickness

**Source:** GDOT 2021 Standard Specifications (`docs/2021StandardSpecifications.pdf`)
**Location:** §400.3.05 (Weather Limitations / Spreading & Finishing), printed page 382 (PDF page 392)
**Extracted with:** `tools/spec_search.py --page std 392`
**Verified:** 2026-06-01

---

## §400.3.05.E — Observe Weather Limitations (verbatim)

> Do not mix and place asphaltic concrete if the existing surface is wet or
> frozen. Do not lay asphaltic concrete OGFC mix or PEM at air temperatures below
> 60 ºF (16 ºC). When using a MTV, OGFC mix or PEM may be placed at 55 ºF (13 ºC)
> when approved by the Engineer. For other courses, follow the temperature
> guidelines in the following table:

> **TABLE 4 — LIFT THICKNESS TABLE**
>
> | Lift Thickness | Minimum Temperature |
> |----------------|---------------------|
> | 1 in. (25 mm) or less | 55 °F (13 °C) |
> | 1.1 to 2 in. (26 mm to 50 mm) | 45 °F (8 °C) |
> | 2.1 to 3 in. (51 mm to 75 mm) | 40 °F (4 °C) |
> | 3.1 to 4 in. (76 mm to 100 mm) | 35 °F (2 °C) |
> | 4.1 to 8 in. (101 mm to 200 mm) | 32 °F (0 °C) and rising. Base material must not be frozen. |

## §400.3.05.F — Table 5 (verbatim)

> **TABLE 5 — MIX TYPE MINIMUM, MAXIMUM LAYER AND TOTAL THICKNESS**
>
> | Mix Type | Min Layer | Max Layer | Max Total |
> |----------|-----------|-----------|-----------|
> | 25 mm Superpave | 2½ in. (64 mm) | 5 in. (125 mm) * | — |
> | 19 mm Superpave | 1¾ in. (44 mm) | 3 in. (75 mm) * | — |
> | 12.5 mm Superpave | 1⅜ in. (35 mm) | 2½ in. (64 mm) **/*** | 8 in. (200 mm) |
> | 9.5 mm Superpave Type 2 | 1⅛ in. (29 mm) | 1½ in. (38 mm) *** | 4 in. (100 mm) |
> | 9.5 mm Superpave Type 1 | ⅞ in. (22 mm) | 1¼ in. (32 mm) | 4 in. (100 mm) |
> | 4.75 mm Mix | ¾ in. (19 mm) | 1⅛ in. (29 mm) | 2 in. (50 mm) |
> | 9.5 mm OGFC | 75 lbs/yd² (41 kg/m²) | 95 lbs/yd² (51 kg/m²) | — |
> | 12.5 mm OGFC | 85 lbs/yd² (46 kg/m²) | 110 lbs/yd² (60 kg/m²) | — |
> | 12.5 mm PEM | 110 lbs/yd² (60 kg/m²) | 165 lbs/yd² (90 kg/m²) | — |
> | 9.5 mm SMA | 1⅛ in. (29 mm) | 1½ in. (38 mm) | 4 in. (100 mm) |
> | 12.5 mm SMA | 1⅜ in. (35 mm) | 3 in. (75 mm) | 6 in. (150 mm) |
> | 19 mm SMA | 1¾ in. (44 mm) | 3 in. (75 mm) | — |
>
> \* Allow up to 6 in. (150 mm) per lift on trench widening.
> \*\* Allow up to 4 in. (100 mm) per lift on trench widening of ≤ 2 ft. when no overlay is required.
> \*\*\* Place 9.5 mm Superpave and 12.5 mm Superpave up to 4 in. (100 mm) thick for driveway and side road transition.

---

## Validation result

- **Table 4 (temperature)** — all five rows match the app exactly →
  `TEMP.LE_1IN`, `TEMP.1_2IN`, `TEMP.2_3IN`, `TEMP.3_4IN`, `TEMP.4_8IN` = ✅ VERIFIED.
- **Table 5 (mix thickness)** — all twelve mix rows match the app's min/max/total
  values exactly → all `THICK.*` rows = ✅ VERIFIED.
- **New finding (not in app docs):** OGFC/PEM placement floor of **60°F**
  (55°F with MTV + Engineer approval), separate from Table 4. Tracked as
  `TEMP.OGFC_PEM_MIN`.
- **Transcription fix:** the app's `GDOT_TABLES.md` footnote markers were
  slightly off — 12.5 mm Superpave should be `**/***` (not `*/**`) and 9.5 mm
  Superpave Type 2 should be `***` (not `**`). The footnote *text* was correct;
  only the marker assignment on those two rows was wrong. Corrected in
  `GDOT_TABLES.md`.

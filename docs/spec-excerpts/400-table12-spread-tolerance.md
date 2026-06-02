# Spec Excerpt — Section 400 Table 12 (Thickness & Spread Rate Tolerance)

**Source:** GDOT 2021 Standard Specifications (`docs/2021StandardSpecifications.pdf`)
**Location:** §400.4.A.2.b, "Table 12 — Thickness and Spread Rate Tolerance at Any Given Location"
**Provided by:** dev tester (excerpt: `Section 400-Table 12-Tolerances.pdf`)
**Verified:** 2026-06-01

---

## Table 12 (verbatim)

> **TABLE 12 — THICKNESS AND SPREAD RATE TOLERANCE AT ANY GIVEN LOCATION**
>
> | Course | Thickness Specified | Spread Rate Specified |
> |--------|---------------------|-----------------------|
> | Asphaltic concrete base course | ± 0.5 in. (± 13 mm) | ± 55 lbs./yd² (30 kg/m²) |
> | Intermediate and/or wearing course | ± 0.25 in. (± 6 mm) | ± 27.5 lbs./yd² (15 kg/m²) |
> | Overall of any combination of 1 and 2 | ± 0.5 in. (± 13 mm) | ± 55 lbs./yd² (30 kg/m²) |
>
> **Note:** For asphaltic concrete 9.5 mm OGFC and 12.5 mm OGFC, control the spread
> rate per lot within 7 lbs./yd² (4 kg/m²) of the designated spread rate. For
> asphaltic concrete 12.5 mm PEM, control the spread rate per lot within
> 10 lbs./yd² (6 kg/m²) of the designated spread rate.
>
> **Note:** Thickness and spread rate tolerances are provided to allow normal
> variations within a given lot. Do not continuously operate at a thickness or
> spread rate not specified.

---

## How the app uses this

- The **Spread Rate** calculator compares the *placed* rate (from a real load over
  the area paved) against the *target* rate (thickness × 110 lbs/SY, or a custom
  target). Previously "in spec" was a hard-coded flat **±5%**, which has no spec
  basis and is sometimes tighter, sometimes looser than GDOT.
- Now the in-spec band is the **absolute Table 12 tolerance** for the selected
  course type, chosen in Job Setup → Paving Setup → **Course type**:
  - Base course → `TOLERANCE.BASE` = ±55 lbs/SY
  - Intermediate/wearing → `TOLERANCE.INTERMEDIATE_WEARING` = ±27.5 lbs/SY
  - OGFC → `TOLERANCE.OGFC` = ±7 lbs/SY (per-lot control window)
  - PEM → `TOLERANCE.PEM` = ±10 lbs/SY (per-lot control window)
- Status bands: within ±tolerance = **In spec** (good); within 1.5× tolerance =
  **Marginal** (warn); beyond = **Out of spec** (bad). The 1.5× warn band is an app
  UX convenience, not a spec value.

## Validation result

- All four spread-rate tolerance values transcribe exactly from the provided
  excerpt → `TOLERANCE.*` = ✅ VERIFIED (Tier 1).
- **Thickness** tolerances (base ±0.5 in, intermediate/wearing ±0.25 in) are recorded
  here but not yet surfaced in the app — candidate for a future thickness-acceptance
  check.
- The "designated/specified spread rate" in the spec is the project plan rate. The
  app treats the Job Setup target (or custom target) as that designated rate; when a
  plan rate is available it should be entered as the custom target.

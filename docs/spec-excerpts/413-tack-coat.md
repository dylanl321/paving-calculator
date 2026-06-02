# Spec Excerpt — Section 413 Bituminous Tack Coat

**Source:** GDOT 2021 Standard Specifications (`docs/2021StandardSpecifications.pdf`)
**Location:** §413.3.05, printed page 449 (PDF page 459)
**Extracted with:** `tools/spec_search.py --page std 459`
**Verified:** 2026-06-01

---

## §413.3.05.A — Seasonal and Weather Limitation (verbatim)

> Do not apply tack coat if the existing surface is wet or frozen. Do not place
> emulsified asphalt if the air temperature in the shade is less than 40 °F (4 °C).

## §413.3.05.B — Application: Table 2 (verbatim)

> **Table 2 - Application Rates for Anionic Emulsified Asphalt or Cationic Emulsified Asphalt, gal/yd² (L/m²)**
>
> | Tack Uses | Minimum | Maximum |
> |-----------|---------|---------|
> | New Asphaltic Concrete Pavement to New Asphaltic Concrete Pavement or Thin Lift Leveling | 0.05 (0.23) | 0.08 (0.36) |
> | New Asphaltic Concrete Pavement (≤ 25 % RAP) to Aged Existing Pavement or Milled Surface | 0.06 (0.27) | 0.10 (0.45) |
> | New Asphaltic Concrete Pavement (> 25 % RAP) to Aged Existing Pavement or Milled Surface | 0.08 (0.36) | 0.12 (0.54) |
>
> - Allow standard anionic emulsified asphalt or cationic emulsified asphalt to break per emulsion manufacturer's recommendation. Proceed with paving only after the anionic emulsified asphalt or cationic emulsified asphalt has cured to the satisfaction of the Engineer.
> - Do not use anionic emulsified asphalt or cationic emulsified asphalt under OGFC or PEM on interstates or limited access state routes.
>
> Note: Application rates for PG Binder Asphalt Cement are specified in Section 400.3.03.A.3.C.

---

## Validation result

- App values in `GDOT_TABLES.md` Table 2 and `validation-matrix.md` rows
  `TACK.NEW_AC`, `TACK.AGED_LE25RAP`, `TACK.AGED_GT25RAP`, and
  `TACK.OGFC_PEM_RESTRICTION` **match the spec exactly** → status ✅ VERIFIED.
- **New finding not yet in app docs:** §413.3.05.A sets a tack-specific weather
  limit — **no emulsified asphalt below 40 °F air temp (shade)**. This is
  distinct from the HMA lift-thickness temperature table (Section 400) and
  should be added as its own warning. Tracked as `TEMP.TACK_MIN`.

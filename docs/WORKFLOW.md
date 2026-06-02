# Field Workflow — The Ideal On-Site Experience

This document defines how a paving crew member should use the app **on the job site**, with the goal of getting a correct answer from the **fewest possible inputs**. It is written so a "simple-minded" user — tired, in the sun, with gloves on — can succeed without reading instructions.

It also captures the **logic validation** of every formula (see Appendix A) so the app's math is trustworthy.

---

## 1. The Guiding Principle: "One Question at a Time"

The biggest mistake a field calculator can make is showing a form with 5 empty boxes. A tired user sees 5 boxes and quits.

Instead, every calculator asks **one question per screen**, in plain language, with a giant number pad. The user taps a number, taps **Next**, and the next question slides in. The answer appears automatically when enough is known — there is **no "Calculate" button to hunt for**.

```
[ How many tons on the truck? ]
            ____
           | 24 |
            ‾‾‾‾
   [ 1 ][ 2 ][ 3 ]
   [ 4 ][ 5 ][ 6 ]
   [ 7 ][ 8 ][ 9 ]
   [ . ][ 0 ][ ← ]

        [  NEXT  ]
```

---

## 2. The Least-Input Strategy

For each calculator we identify the **absolute minimum** the user must type, and we get everything else from one of three sources, in this order of preference:

1. **Remembered** — the app stores the last value used (road width, mix type, machine type). On the next job these are pre-filled; the user just confirms by tapping Next.
2. **Picked, not typed** — anything with a known set of options (mix type, machine, tack application) is a **big-button picker**, not a keyboard. Tapping is faster and error-proof vs. typing.
3. **Derived** — if the app can compute a value from something the user already gave, it does. Example: the user types a **thickness** and the spread rate is derived (× 110), so they never type a spread rate.

> **Rule:** The only things a user should ever *type* are real-world measurements they read off a truck ticket, a tape measure, or a stick. Everything else is remembered, picked, or derived.

---

## 3. Smart Defaults (Remembered Between Jobs)

These persist on the device and are pre-filled every time:

| Value | Why it rarely changes | Default if never set |
|-------|----------------------|----------------------|
| Road / mat width (ft) | A crew runs the same width for hours | 12 |
| Mix type | Set once per job | (none — ask once) |
| Machine in use | Shuttle Buggy vs. Paver only changes between jobs | Paver |
| Truck load size (tons) | Fleet standard | 18.5 |
| Tack application type | Set per job | Leveling |
| Base material + density (pcf) | Same material all day; custom values saved | (pick once) |

A small **"Job Setup"** screen lets a foreman set width + mix + machine once in the morning. After that, every calculator is 1–2 taps.

---

## 4. The Five Calculators — Ideal Flows

Each flow lists the **minimum taps** for a user who has already done Job Setup.

### 4.1 Spread Rate — "Am I putting down the right amount?"

This is the most-used check. There are two ways to answer it; the app should let the user pick whichever inputs they have on hand.

**Path A — Fastest (target check, 1 tap):**
> "What thickness am I shooting for?" → pick `1.5"` → **Answer: 165 lbs/SY**

This uses `thickness × 110`. It is the quickest sanity number and needs no truck or distance data.

**Path B — Reality check from a real load (3 inputs):**
> "How many tons did you place?" → `24`
> "How far did it go?" (ft) → `400`
> *(width remembered = 12)*
> **Answer: 90 lbs/SY** — with a colored badge: 🟢 in spec / 🟠 low / 🔴 high vs. the target from Path A.

The machine retention (Shuttle Buggy −24 t / Paver −14 t) is applied automatically from the remembered machine, but **only when the tons entered represent a full machine pass**. See the modifier note in §5.

**Why this is ideal:** the user usually just wants Path A (one tap). Power users verifying against a real load use Path B. Both live on the same screen with a small toggle: **[ By Thickness ] [ By Load ]**.

### 4.2 Remaining Distance / Feet Left Today — "How many more feet can we do today?"

This is the question crews ask most at the truck. Default to the simplest version.

**Default — Loads Left (1 input):**
> "How many loads are left?" → `10`
> *(width remembered = 12, target spread rate carried over = 165)*
> **Answer: ~1,681 ft left today**

If the user hasn't set a target rate yet, ask one more: "What thickness?" → derive the rate. So **1 input** in the common case, 2 at most.

**Optional — Track the Whole Day** (behind a "..." toggle, for foremen):
> "Tons ordered today?" → `300`
> "Tons placed so far?" → `120`
> **Answer: ~1,636 ft left** (and, as context, "≈ 1,091 ft done so far")

Both paths use the same `tons → feet` engine; the only difference is whether "tons remaining" comes from **loads left** or **ordered minus placed**. The big result is always feet; everything else is secondary text.

### 4.3 Tack Rate — "How many gallons do I need?"

> "Length to shoot?" (ft) → `400`
> *(width remembered = 12)*
> "What's it for?" → pick **Leveling / Topping / OGI / Rock Chip**
> **Answer: ~107 gal** (using the mid-point of the picked rate range)

The app shows the gallons for the **min, mid, and max** of the spec range so the user sees the safe window, and flags if their job is under OGFC/PEM on an interstate (where these emulsions are **not allowed**).

### 4.4 Tonnage to Order — "How much should I order?"

> "Length of the job?" (ft) → `1000`
> *(width remembered = 12)*
> "What thickness?" → pick `2"` → derive rate 220
> **Answer: ~147 tons** (with a suggested **+5–10% waste** toggle)

### 4.5 Stick Check — "What should I see behind the screed?"

> "Target compacted thickness?" → `1.5"`
> **Answer: Set your stick to 1.8"**

Pure `× 1.2`. One input, instant answer. This one can even live on the home screen as a slider.

### 4.6 Soil / Cement & Aggregate — "How much material, cement, and water?"

This is a small **second toolset** for base work (soil-cement, GAB, stone). It runs on a **density in pcf**, which the user picks from a material list or stores once — they should rarely type a density. Everything reuses the remembered width.

**Material setup (pick once, remembered):**
> "What material?" → pick **Soil-Cement / GAB / Crushed Stone / Sand / Custom**
> The picker pre-fills a typical density (e.g. GAB ≈ 140 pcf); a tiny "edit" lets a user override and **save their own** value for next time.

**Tonnage to place / order (2 inputs):**
> "Length?" (ft) → `1000`  *(width remembered = 12)*
> "Depth?" (in) → `6`
> **Answer: ~375 tons** (at the material's density)

**Depth quick check (1 input):**
> "Depth?" (in) → `6`
> **Answer: 562.5 lbs/SY** — the soil version of the asphalt thickness check, for verifying against a truck ticket.

**Cement to spread (1–2 inputs):**
> "How are you specifying cement?" → pick **lbs/SY** or **% by weight**
> lbs/SY path: "Cement rate?" → `40` → **Answer: tons of cement + number of 94-lb bags**
> % path: "Cement %?" → `6` *(uses area + depth + density already known)* → **Answer: tons / bags / lbs/SY**

**Water to add for compaction (2 inputs):**
> "Current moisture %?" → `8`
> "Optimum moisture %?" → `12`
> *(area + depth + density known)*
> **Answer: ~X gallons to add** (or 🟢 "Already at/over optimum — no water needed").

**Density / compaction check (2–3 inputs):**
> "Field density?" (pcf) → `133`
> "Max dry density?" (pcf) → `140`
> optional "Moisture %?" → `12` (to convert wet→dry)
> **Answer: 95% compaction** with 🟢 pass / 🔴 fail against the spec target.

**Why this is ideal:** the only number a user types is a real measurement (length, depth, a meter/Proctor reading). Material density, bag weight (94 lb), and water weight (8.34 lb/gal) are all built in or remembered, so even the "simple" user just picks a material and enters a depth.

---

## 5. Modifiers (The "It Depends" Toggles)

These are the few real-world variables that change the math. Each is a **single tap toggle or picker**, hidden behind a "..." until needed so they don't clutter the default flow.

| Modifier | Affects | How it's presented | Default |
|----------|---------|--------------------|---------|
| **Machine type** (Shuttle Buggy / Paper / None) | Spread Rate — subtracts 24 t / 14 t / 0 t of retained material | 3-button picker in Job Setup | Paver |
| **First pass vs. continuous** | Whether machine retention applies at all (retention only matters on the *first* load filling an empty machine) | Toggle on the Spread Rate "By Load" screen | Continuous (no subtraction) |
| **Truck load size** | Remaining Distance | Number, remembered | 18.5 t |
| **Tack application** | Tack Rate range | 4-button picker | Leveling |
| **Surface type** (new AC / aged-milled / >25% RAP) | Tack Rate — switches to GDOT spec range | Picker, shown only in "spec mode" | New AC |
| **Waste allowance** | Tonnage to Order | Off / +5% / +10% chips | Off |
| **Base material / density** | All Soil/Cement calcs | Material picker w/ editable, savable pcf | (pick once) |
| **Cement spec mode** | Cement Spread | lbs/SY vs. % by weight toggle | lbs/SY |
| **Daily roll-up source** | Feet Left Today | Loads-left vs. ordered-minus-placed toggle | Loads left |
| **Units of the answer** | Display only | ft ↔ yards toggle on results | ft |

> **Critical clarification baked into the app:** machine retention is **subtracted in tons before** converting to pounds, i.e. `Pounds = (Tons − Retention) × 2,000`. It applies **only to the load that first fills an empty machine**, not to every subsequent load. The "First pass" toggle exists precisely so a tired user doesn't wrongly subtract 24 tons from every reading. (See Appendix A, item 1.)

---

## 6. Always-On Safety / Sanity Layer

Because the user may be too rushed to notice a bad number, the app validates **after** every answer and shows a colored banner:

- **Temperature warning** — if the user has set today's air temp and the chosen lift thickness, compare against GDOT Table 4. Too cold → 🔴 "Air temp 42°F is below the 45°F minimum for a 1.5" lift."
- **Lift thickness warning** — compare chosen thickness against GDOT Table 5 min/max for the selected mix type. Out of range → 🟠 "1.5" is below the 1¾" minimum for 19 mm Superpave."
- **Tack out of spec** — if a typed shot rate falls outside the picked application's range → 🟠.
- **Interstate emulsion ban** — if surface is under OGFC/PEM on an interstate → 🔴 "Anionic/cationic emulsion not allowed here."

These never block the user; they just warn. A foreman who knows better can ignore them.

---

## 7. Home Screen (The 1-Tap Promise)

```
┌─────────────────────────────┐
│   PAVING CALC      ☼ 78°F    │   ← optional temp the user sets once
├──────────────┬──────────────┤
│  SPREAD      │  FEET LEFT    │
│  RATE        │  TODAY        │
├──────────────┼──────────────┤
│  TACK        │  TONNAGE      │
│  RATE        │  TO ORDER     │
├──────────────┼──────────────┤
│  STICK       │  SOIL /       │
│  CHECK       │  CEMENT       │
├──────────────┼──────────────┤
│  REFERENCE TABLES            │
└──────────────┴──────────────┘
        [  JOB SETUP  ]
```

- Seven giant tiles, each ≥ 48 px (really ~half the screen), labeled in plain words.
- The two most-asked questions — **Spread Rate** and **Feet Left Today** — are the top row.
- **Soil / Cement** opens its own small toolset (tonnage, cement, water, density).
- "Job Setup" is the only secondary action — set width/mix/machine/material once.

---

## 8. Designing for Every Skill Level

| User | What they do | How the app serves them |
|------|--------------|-------------------------|
| **The rusher / "simple-minded"** | Wants one number, now | One-question-at-a-time flow, derived defaults, no Calculate button. Can get a spread rate in **one tap** (pick thickness). |
| **The operator** | Checks reality against target | "By Load" mode, stick check, remaining distance from loads. |
| **The foreman** | Sets up the job, orders material | Job Setup, Tonnage with waste %, Feet Left Today (whole-day roll-up), soil/aggregate ordering, reference tables. |
| **The inspector** | Verifies spec compliance | Spec-mode tack ranges, temperature & lift-thickness warnings, soil density/compaction check, GDOT tables. |
| **The base / dirt crew** | Places soil-cement, GAB, stone | Soil/Cement toolset — tonnage by depth+density, cement spread, water to add, compaction check. |

The same screens serve all four — advanced inputs are progressively disclosed behind "..." so the simple path stays simple.

---

## 9. Worked Examples (for QA)

| Calculator | Inputs | Expected Result |
|------------|--------|-----------------|
| Spread (thickness) | 1.5" | 165 lbs/SY |
| Spread (by load) | 24 t, 400 ft, 12 ft wide, Paver continuous | 90 lbs/SY |
| Spread (by load, first pass Paver) | 24 t, 400 ft, 12 ft, −14 t | ~37.5 lbs/SY |
| Remaining | 10 loads, 12 ft, 165 lbs/SY | ~1,681 ft |
| Feet today (ordered−used) | 300 t ordered, 120 t used, 12 ft, 165 | ~1,636 ft left |
| Tack | 400 ft, 12 ft, Leveling (0.05 mid) | ~107 gal |
| Tonnage | 1000 ft, 12 ft, 2" (220) | ~147 t |
| Stick check | 1.5" | 1.8" |
| Soil tonnage | 1000 ft, 12 ft, 6", 125 pcf | ~375 t |
| Soil depth check | 6", 125 pcf | 562.5 lbs/SY |
| Cement (% by wt) | area+6" depth, 125 pcf, 6% | dry soil × 0.06 → tons/bags |
| Water to add | dry soil wt, 8% → 12% | (dry lbs × 0.04) ÷ 8.34 gal |
| Compaction | 133 pcf field / 140 pcf max | 95% 🟢 |

---

## Appendix A — Logic Validation

Every formula was checked against the original field card (`docs/reference-images/field-formula-card.jpeg`) and GDOT tables. Results:

1. **Spread Rate (placed) — ✅ correct, with one clarification.**
   `lbs/SY = (Tons × 2000) ÷ (Length × Width ÷ 9)`.
   The field card subtracts machine retention in **tons before** the ×2000: `Pounds = (Tons − Retention) × 2000`. The app must apply it in that order, and **only on the load that first fills an empty machine** — not every load. This is the single most error-prone spot in the spec; the "First pass" modifier (§5) guards against it.

2. **Spread Rate (from distance) — ✅ correct.** Same as above using distance for length. No retention shown, which is right for a continuous mat.

3. **Quick conversion (× 110) — ✅ correct & internally consistent.** Spot-checked against the conversion table: 0.41×110≈45, 0.77×110≈85, 1.5×110=165, 2.0×110=220, 4.75×110≈522.5. All match.

4. **Remaining Distance — ✅ correct.** The card's `[(Loads×18.5)×2000 ÷ Width] ÷ Rate × 9` and the docs' "simplified" `(Loads×37000) ÷ (Width × Rate ÷ 9)` are **algebraically equal** to `Loads × 37000 × 9 ÷ (Width × Rate)`. Sanity check: 10 loads, 12 ft, 165 lbs/SY → 1,681 ft. ✓ (37,000 = 18.5 × 2000.)

5. **Tack Rate — ✅ correct.** `Gallons = (Length × Width ÷ 9) × ShotRate`. Note `gal/SY` (field card) and `gal/yd²` (GDOT) are the **same unit** — present consistently as gal/SY in the UI.

6. **Tonnage to Order — ✅ correct.** `Tons = (Length × Width ÷ 9 × SpreadRate) ÷ 2000`. Exact inverse of spread rate. ✓

7. **Stick Check — ✅ correct.** `Loose = Compacted × 1.2`. 1.5 → 1.8. ✓

8. **Constants — ✅ all verified** against the field card and GDOT: 9 SF/SY, 2000 lb/ton, 18.5 t/truck, 24 t Shuttle Buggy / 14 t Paver retention, 110 lbs/SY/in, 1.2× compaction.

9. **Feet Left Today — ✅ correct.** Both modes reduce to `Feet = Tons × 2000 × 9 ÷ (Width × Rate)`, the same engine as Remaining Distance. Loads-left mode sets `Tons = Loads × 18.5`; whole-day mode sets `Tons = Ordered − Placed`. Sanity check: 180 t left, 12 ft, 165 lbs/SY → 360,000 lbs ÷ 220 = 1,636 ft. ✓

10. **Soil/Cement & densities — ✅ new, derived from first principles (no field-card source).** These are standard civil formulas, dimensionally checked:
    - Tonnage: `L × W × (D/12) × pcf ÷ 2000`. Check: 1000×12×0.5×125÷2000 = 375 t. ✓
    - Depth-to-weight: `(D/12) × pcf × 9 = D × pcf × 0.75`. Check: 6×125×0.75 = 562.5 lbs/SY. ✓
    - Cement % path: `Dry soil tons × %`; bags = lbs ÷ 94 (standard bag). ✓
    - Water: `Dry soil lbs × (OptMC − CurMC) ÷ 8.34` (8.34 lb/gal water). ✓
    - Compaction: `Field dry ÷ Max dry × 100`; `Field dry = Wet ÷ (1 + MC)`. ✓
    - **Note:** densities (pcf) are typical rules-of-thumb; the project Proctor/mix-design values should override and are user-editable. Unlike the asphalt formulas, these have **no field-card source**, so they should be reviewed by the user against their own spec before relying on them.

**No mathematical errors were found** in the asphalt formulas. The soil/cement formulas are standard and dimensionally verified, but are **new additions without a field-card source** — flagged for user/spec review (especially the typical density ranges). The only asphalt implementation risk remains the **ordering and applicability of machine retention** in calculator #1, which §5's "First pass" toggle and the `(Tons − Retention) × 2000` ordering resolve.

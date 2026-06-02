# Paving Calculator — Formulas & Specifications

All formulas used in the application, derived from field reference cards and GDOT specifications.

> **Validation:** Every value below is tracked in the
> [Validation Matrix](validation-matrix.md) with a source citation and
> verification status. See [VALIDATION.md](VALIDATION.md) for how values are
> traced to the GDOT Standard/Supplemental Specs and Construction Manual.
> Spec values transcribed from photos are `UNVERIFIED` until line-checked
> against the PDFs; field-card values are labeled `FIELD_ESTIMATE`.

---

## 1. Spread Rate (Placed Material)

Determines the weight of asphalt per square yard actually placed on the road.

```
Square Yards = Length (ft) × Width (ft) ÷ 9

Pounds Placed = Total Tons × 2,000
  - Subtract 24 tons if using Shuttle Buggy (material retained in machine)
  - Subtract 14 tons if just using Paver (material retained in hopper)

Spread Rate (lbs/SY) = Pounds ÷ Square Yards
```

### Alternative (from known distance):

```
Spread Rate (lbs/SY) = [Total Tons × 2,000] ÷ [Distance (LF) × Width (ft) ÷ 9]
```

### Quick Conversion:

```
Spread Rate (lbs/SY) = Thickness (inches) × 110
```

**Example:** 1.5" thick = 1.5 × 110 = 165 lbs/SY

### Common Spread Rate Conversion Table:

| Inches | LB/SY | Inches | LB/SY | Inches | LB/SY |
|--------|-------|--------|-------|--------|-------|
| 0.41   | 45    | 1.00   | 110   | 2.00   | 220   |
| 0.45   | 50    | 1.25   | 137.5 | 2.25   | 247.5 |
| 0.50   | 55    | 1.50   | 165   | 2.50   | 275   |
| 0.77   | 85    | 1.75   | 192.5 | 2.75   | 302.5 |
| 3.00   | 330   | 3.25   | 357.5 | 4.00   | 440   |
| 3.50   | 385   | 3.75   | 412.5 | 4.25   | 467.5 |
| 4.50   | 495   | 4.75   | 522.5 |        |       |

---

## 2. Remaining Asphalt Distance

Estimates how much more road can be paved with remaining material.

```
Remaining Distance (ft) = [Truck Loads × 18.5 (tons/truck) × 2,000] ÷ [Road Width (ft)] ÷ Desired Spread Rate × 9
```

**Simplified:**
```
Remaining Distance (ft) = (Truck Loads × 37,000) ÷ (Road Width × Desired Spread Rate ÷ 9)
```

**Notes:**
- Standard truck load = 18.5 tons
- Spread rate in lbs/SY
- Result in linear feet

### 2a. Feet Left Today (Daily Roll-Up)

Answers the field question: **"How many more feet can we do today?"**

This is the same engine as Remaining Distance, just framed around what is left for the day. Two modes:

**Mode A — Loads Left (primary, simplest):**
```
Feet Left Today = (Loads Remaining × Tons/Load × 2,000) ÷ (Width × Spread Rate ÷ 9)
```
The user enters only the number of loads still expected on site.

**Mode B — Ordered Minus Used (whole-day tracking, optional):**
```
Tons Remaining   = Tons Ordered − Tons Already Placed
Feet Left Today  = (Tons Remaining × 2,000) ÷ (Width × Spread Rate ÷ 9)
```
Use when a foreman knows total tons ordered for the day and tons already run.

**Optional context (display only, not part of the core answer):**
```
Feet Done So Far = (Tons Already Placed × 2,000) ÷ (Width × Spread Rate ÷ 9)
```

**Notes:**
- Spread rate in lbs/SY (typically the day's target rate)
- Both modes reduce to the same `tons → feet` conversion: `Feet = Tons × 2000 × 9 ÷ (Width × Rate)`

---

## 3. Tack Rate

Calculates gallons of tack coat (emulsified asphalt) to spray for a given area.

```
Gallons Shot = Length (ft) × Width (ft) ÷ 9 × Shot Rate (gal/SY)
```

### Known Desired Tack Shot Rates:

| Application | Rate (gal/SY) |
|-------------|---------------|
| Leveling    | 0.040 – 0.060 |
| Topping     | 0.040 – 0.060 |
| OGI (Open-Graded Interlayer) | 0.060 – 0.080 |
| Rock Chip   | 0.085 |

### GDOT Spec Rates (Anionic/Cationic Emulsified Asphalt):

| Tack Use | Min (gal/yd²) | Max (gal/yd²) |
|----------|---------------|---------------|
| New AC to New AC or Thin Lift Leveling | 0.05 | 0.08 |
| New AC (≤25% RAP) to Aged/Milled Surface | 0.06 | 0.10 |
| New AC (>25% RAP) to Aged/Milled Surface | 0.08 | 0.12 |

**Notes:**
- Allow emulsion to break per manufacturer's recommendation before paving
- Do NOT use anionic/cationic emulsified asphalt under OGFC or PEM on interstates or limited access state routes

---

## 4. Tonnage to Order

Estimates how much asphalt to order for a job.

```
Tonnage = [Length (ft) × Width (ft) ÷ 9 × Spread Rate (lbs/SY)] ÷ 2,000
```

---

## 5. Stick Check Height

Converts desired compacted thickness to loose (pre-compaction) material height for checking behind the screed.

```
Stick Check Height = Desired Thickness × 1.2
```

**Example:** Target 1.5" compacted → check for 1.8" loose behind screed

---

## 6. Soil / Cement & Aggregate

Calculations for soil-cement base, graded aggregate base (GAB), and similar
materials placed by **depth and density** rather than by spread rate. All weight
math is driven by an in-place **density in pounds per cubic foot (pcf)** that is
either chosen from a material list or entered/stored by the user.

### 6.1 Material Volume

```
Cubic Feet  = Length (ft) × Width (ft) × Depth (ft)
            = Length (ft) × Width (ft) × [Depth (in) ÷ 12]

Cubic Yards = Cubic Feet ÷ 27
```

### 6.2 Tonnage from Depth + Density (place / order)

The soil/aggregate equivalent of "Tonnage to Order."

```
Tons = [Length (ft) × Width (ft) × Depth (in) ÷ 12 × Density (pcf)] ÷ 2,000
```

**Example:** 1,000 ft × 12 ft × 6 in at 125 pcf
= 1000 × 12 × 0.5 × 125 ÷ 2000 = **375 tons**

### 6.3 Depth-to-Weight (per square yard)

The soil analog of the asphalt `thickness × 110` quick check. Gives the placed
weight per SY for any material density, so a target depth can be sanity-checked
against a truck ticket.

```
lbs/SY = Depth (in) ÷ 12 × Density (pcf) × 9
       = Depth (in) × Density (pcf) × 0.75
```

**Example:** 6 in at 125 pcf = 6 × 125 × 0.75 = **562.5 lbs/SY**

### 6.4 Cement Spread Rate

How much portland cement to spread before mixing, by either a target
application rate or a percent-by-weight of the dry soil.

**By application rate (lbs/SY):**
```
Cement (tons) = [Length (ft) × Width (ft) ÷ 9 × Cement Rate (lbs/SY)] ÷ 2,000
Bags (94 lb)  = Cement (lbs) ÷ 94
```

**By percent of dry soil weight:**
```
Dry Soil (tons)  = [Area (SY) × Depth (in) ÷ 12 × 9 × Dry Density (pcf)] ÷ 2,000
Cement (tons)    = Dry Soil (tons) × Cement %
Cement (lbs/SY)  = Cement (tons) × 2,000 ÷ Area (SY)
```

**Notes:**
- One bag of portland cement = 94 lbs (standard)
- Typical soil-cement content runs ~4–10% by dry weight (mix design governs)

### 6.5 Moisture / Water to Add

Water needed to bring soil from its current moisture to optimum moisture
content (OMC) for compaction. Moisture is a percent of **dry** soil weight.

```
Dry Soil Weight (lbs) = Area (SY) × Depth (in) ÷ 12 × 9 × Dry Density (pcf)

Water to Add (lbs)    = Dry Soil Weight × (Optimum % − Current %)
Water to Add (gal)    = Water to Add (lbs) ÷ 8.34
```

**Notes:**
- Moisture % entered as a decimal in the math (e.g. 12% = 0.12)
- 1 gallon of water = 8.34 lbs
- If `Current % ≥ Optimum %`, no water is needed (soil may need to dry out)

### 6.6 In-Place Density / Compaction Check

Verifies field density against the lab maximum dry density (Proctor) target.

```
% Compaction = Field Dry Density (pcf) ÷ Max Dry Density (pcf) × 100

Field Dry Density (pcf) = Field Wet Density (pcf) ÷ (1 + Moisture %)
```

**Notes:**
- Spec target is typically **95–100%** of max dry density (project governs)
- Pass/fail badge: 🟢 at or above target, 🔴 below target
- `Moisture %` as a decimal (e.g. 0.12 for 12%)

### 6.7 Reference Densities (typical, in-place pcf)

Starting values; users can override and store their own per material.

| Material | Typical Density (pcf) |
|----------|------------------------|
| Compacted soil-cement base | 120 – 135 |
| Graded Aggregate Base (GAB) | 135 – 145 |
| Crushed stone | 100 – 120 |
| Sand | 100 – 110 |
| Compacted clay | 100 – 115 |
| Topsoil (loose) | 75 – 90 |

> These are field rules-of-thumb. The project's mix design / Proctor values
> always take precedence and should be entered when known.

---

## 7. Constants & Assumptions

| Item | Value |
|------|-------|
| Square feet per square yard | 9 |
| Pounds per ton | 2,000 |
| Standard truck load | 18.5 tons |
| Shuttle Buggy retained material | 24 tons |
| Paver hopper retained material | 14 tons |
| Thickness-to-spread-rate multiplier | 110 lbs/SY per inch |
| Stick check compaction factor | 1.2× |
| Cubic feet per cubic yard | 27 |
| Portland cement bag weight | 94 lbs |
| Weight of water | 8.34 lbs/gallon |
| Soil/aggregate density unit | pounds per cubic foot (pcf) |
| Typical compaction spec target | 95–100% of max dry density |

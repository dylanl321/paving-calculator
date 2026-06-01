# Paving Calculator — Formulas & Specifications

All formulas used in the application, derived from field reference cards and GDOT specifications.

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

## 6. Constants & Assumptions

| Item | Value |
|------|-------|
| Square feet per square yard | 9 |
| Pounds per ton | 2,000 |
| Standard truck load | 18.5 tons |
| Shuttle Buggy retained material | 24 tons |
| Paver hopper retained material | 14 tons |
| Thickness-to-spread-rate multiplier | 110 lbs/SY per inch |
| Stick check compaction factor | 1.2× |

# UI/UX Requirements

## Target Users

Asphalt paving crew members (foremen, operators, inspectors) who need quick calculations in the field.

## Environment Constraints

- **Outdoor use** — bright sunlight, needs high contrast
- **Dirty/gloved hands** — large touch targets (minimum 48px), no small buttons
- **Quick access** — most-used calculators should be 1 tap from home screen
- **No connectivity** — must work fully offline (PWA with service worker)
- **Mobile-first** — primary use on phones; tablet/desktop is secondary

## Core UX Principles

1. **Speed over polish** — get the answer in as few taps as possible
2. **Big numbers** — results should be immediately readable at arm's length
3. **Memory** — remember last-used values (road width, mix type, etc.)
4. **Unit clarity** — always show units next to values (lbs/SY, gal/yd², ft, etc.)
5. **No login** — zero friction, just open and use

## Screen Layout (Proposed)

### Home Screen
- Grid of calculator tiles (large, thumb-friendly)
  - Spread Rate
  - Remaining Distance
  - Tack Rate
  - Tonnage to Order
  - Stick Check
  - Reference Tables

### Calculator Screens
- Large numeric input fields
- Smart defaults from last use (localStorage)
- Inline unit labels
- Big bold result display
- Optional "show work" expandable section showing the formula steps
- Quick-clear / reset button

### Reference Tables Screen
- Searchable/filterable
- Lift thickness table with temp warnings
- Mix type specifications
- Tack rate ranges
- Spread rate conversion chart

## Color Scheme

- Dark mode default (better for outdoor visibility, saves battery on OLED)
- High contrast yellow/white text on dark backgrounds
- Orange/red for warnings (temperature too low, rate out of spec)
- Green for in-spec values

## Technical Requirements

- [ ] PWA manifest + service worker for offline
- [ ] installable to home screen (iOS + Android)
- [ ] localStorage for persisting last-used values
- [ ] No backend required — all client-side
- [ ] Bundle size < 200KB (fast load on spotty cell)
- [ ] Works on iOS Safari 15+ and Chrome Android 90+

## Accessibility

- Minimum font size 16px for inputs (prevents iOS zoom)
- WCAG AA contrast ratios minimum
- Logical tab order
- No horizontal scrolling on any screen size

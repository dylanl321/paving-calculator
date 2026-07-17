# Paverate Phone App — Build Prompt

## One-line prompt

Build a simple phone app that runs the same asphalt paving calculators as the Paverate web app. It takes job measurements the crew types in (depths, lengths, widths, tons) and optional automatic data (like local weather/temperature), then returns clear field answers with no account required.

## What this app is

**Paverate** is a field calculator for asphalt paving crews. Today it exists as a mobile-first web PWA. The phone app should carry over **all of that calculation logic** into a simpler native-style phone experience — fewer screens, bigger numbers, faster taps.

Crews use it on the job site: outdoors, often with gloves, sometimes with no signal. Speed and clarity matter more than polish.

## How data gets in

Two kinds of inputs:

1. **Job items (manual)** — measurements and setup the crew already knows or reads off tickets/tapes:
   - Road / mat width (ft)
   - Lift thickness / depth (in)
   - Length / distance paved (ft)
   - Tons placed or ordered
   - Loads left / truck load size
   - Machine type (paver vs shuttle buggy)
   - Tack application type and area
   - Stick-check compacted height

2. **Automatic (when available)** — pull without typing when the phone can provide it:
   - Local air temperature / weather (for placement and tack temperature limits)
   - Remembered last-used job settings (width, mix, machine, truck size)
   - Optional GPS/location only if it helps weather lookup; never required to calculate

Rule: the user should only type real-world measurements. Everything else is remembered, picked from big buttons, or filled automatically.

## What the app calculates (same logic as the web app)

Port these calculators and formulas as-is from the web app config (`paverate.yaml` + `formulas.ts`):

| Calculator | Question it answers |
|---|---|
| **Spread Rate** | Am I putting down the right amount? (lbs/SY from thickness or from tons + distance + width) |
| **Feet Left Today** | How many more feet can today's remaining loads cover? |
| **Tack Rate** | How many gallons of tack do I need for this area? |
| **Tonnage** | How much mix should I order for this run? |
| **Stick Check** | What loose stick height matches my compacted depth? |
| **Reference** | Spec helpers — lift thickness vs min air temp, tack ranges, mix tables |

Show units next to every number. When a result can be checked against a target or spec, show a simple in-range / caution / out-of-range status.

## Product principles

- **Offline-first** — all math runs on device; weather is optional enrichment, never a blocker
- **No login required** to calculate
- **One job setup** (width, thickness, machine, truck size) shared across every calculator
- **Big results**, large touch targets, high contrast for outdoor use
- **Show the work** optionally — formula + source so the number is not a black box
- **Config-driven** — constants, rates, and labels live in one editable config (same idea as the web YAML), not hardcoded magic numbers

## Goal

Take all the paving math and field workflow from the Paverate web app and deliver it as a simple phone app: enter job data (or let weather/settings fill what they can), get the answer in as few taps as possible.

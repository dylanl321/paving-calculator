# Field Paving Calculator — Phone App Prompt

## One-line prompt

Build a simple, standalone phone app for asphalt paving crews. The app takes in job data either automatically (like local weather/temperature) or manually as job items (depths, lengths, widths, tons, loads). It runs paving field calculators on-device and returns clear answers fast — no account, no backend, no connection to any other app.

## What this app is

An independent field calculator for asphalt paving crews. It lives only on the phone. It does not sync with, depend on, or share data with any website or other product.

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
   - Remembered last-used job settings on this device (width, mix, machine, truck size)
   - Optional GPS/location only if it helps weather lookup; never required to calculate

Rule: the user should only type real-world measurements. Everything else is remembered on-device, picked from big buttons, or filled automatically.

## What the app calculates

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

- **Fully independent** — own codebase, own config, own install; no link to another app or service for core use
- **Offline-first** — all math runs on device; weather is optional enrichment, never a blocker
- **No login required** to calculate
- **One job setup** (width, thickness, machine, truck size) shared across every calculator on this device
- **Big results**, large touch targets, high contrast for outdoor use
- **Show the work** optionally — formula + source so the number is not a black box
- **Config-driven** — constants, rates, and labels live in one editable config on this app, not hardcoded magic numbers

## Goal

A simple phone app that gathers job inputs (typed or automatic), runs paving field math locally, and gives the crew an answer in as few taps as possible — standing completely on its own.

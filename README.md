# Paverate

[![Unit Coverage](https://img.shields.io/badge/unit%20coverage-80%25%20threshold-brightgreen)](coverage/index.html)
[![Integration Coverage](https://img.shields.io/badge/integration%20coverage-60%25%20threshold-yellow)](coverage/index.html)
[![Component Coverage](https://img.shields.io/badge/component%20coverage-50%25%20threshold-orange)](coverage/index.html)

**Paverate** is a mobile-first PWA for in-field asphalt paving calculations.
It is built for paving crews to get answers fast on the job site — spread rate,
feet left today, tack coat gallons, tonnage to order, and stick-check height —
all from a single scrolling dashboard that works **offline** and **without an
account**.

## Highlights

- **Single-scroll dashboard** — every calculator is visible at once. No drilling
  into pages or hiding inputs behind buttons.
- **Shared job setup** — width, lift thickness, machine, and truck size are set
  once in the sticky **Job** bar and flow into every calculator.
- **Show your work** — each card has a "How this is figured" panel with the
  formula and a source badge, so the number is never a black box.
- **Offline-first** — all math runs client-side; the app installs as a PWA and
  works with no signal.
- **One file to change everything** — values, formulas, spec rates, constants,
  color tokens, and labels live in a single editable config (see below).

## Calculators

- **Spread Rate** — lbs/SY from placed tons, distance, and width
- **Feet Left Today** — how much more road today's remaining loads will cover
- **Tack Rate** — gallons of tack for the area at the chosen application rate
- **Tonnage** — how much mix to order for a run
- **Stick Check** — desired compacted height converted to loose stick height
- **Reference** — GDOT spec tables (placeholder, expanding)

## Single source of configuration

All tunable values, formulas, spec rates, constants, color tokens, and labels
live in **one easily editable place**:

- `src/lib/config/paverate.yaml` — theme tokens, constants, machines, tack
  rates, mix/thickness specs, soil densities, and calculator metadata. Every
  entry carries a validation status and tier.
- `src/lib/config/formulas.ts` — pure calculation functions that read constants
  from the YAML (no magic numbers in code).
- `src/lib/config/index.ts` — typed accessors that expose values **with their
  source metadata** so the UI can show where a number comes from.

Change a rate, color, or label in the YAML and it updates everywhere. Values are
tracked against the [Validation Matrix](docs/validation-matrix.md) and
[VALIDATION.md](docs/VALIDATION.md) so each one is traceable to a GDOT spec or
flagged as a field estimate until verified.

## Accounts & organizations (planned framework)

The calculators work fully **signed-out and offline**. An optional cloud layer —
login, organizations (companies), job sites with saved calculations, an org
admin panel, and a global admin panel — is designed for but **not yet
implemented**, and will never gate the core field experience.

## Tech stack

- **SvelteKit** (Svelte 5 runes) — small bundle, fast on mobile
- **Vite** + **@vite-pwa/sveltekit** — PWA / service worker generation
- **@rollup/plugin-yaml** — import the config YAML directly
- **@sveltejs/adapter-cloudflare** — deploys to Cloudflare Pages
- **Wrangler** — local preview and Cloudflare types

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server (http://localhost:5173)
```

### Useful scripts

```bash
npm run check    # wrangler types + svelte-check
npm run build    # production build (Cloudflare Pages output + PWA)
npm run preview  # preview the production build via wrangler pages dev
npm run gen      # regenerate Cloudflare worker types
```

## Deployment (Cloudflare Pages)

The app builds to a static Cloudflare Pages bundle.

1. Push this repo to GitHub.
2. In the Cloudflare dashboard, create a **Pages** project and connect the repo.
3. Use the **SvelteKit** preset (build command `npm run build`, output directory
   `.svelte-kit/cloudflare`).

`wrangler.jsonc` already sets the project name and build output directory, so
Pages picks them up automatically.

## Project layout

```
src/
  lib/
    config/        # paverate.yaml + formulas.ts + index.ts (single source of truth)
    components/     # dashboard cards + shared UI (NumberField, ShowWork, …)
    stores/         # persisted shared job store (localStorage)
  routes/           # +layout, dashboard (+page), reference
static/             # favicon + generated PWA icons
tools/              # icon generation + spec search helpers
docs/               # formulas, GDOT tables, requirements, validation
branding/           # Paverate logo assets
```

## Documentation

- [Requirements (UI/UX, config, accounts & orgs)](docs/REQUIREMENTS.md)
- [Formulas & Specifications](docs/FORMULAS.md)
- [GDOT Reference Tables](docs/GDOT_TABLES.md)
- [Validation Matrix](docs/validation-matrix.md) · [Validation process](docs/VALIDATION.md)

## License

MIT

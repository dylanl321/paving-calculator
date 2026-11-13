# PaveRate

PaveRate is a mobile-first paving operations app. Crews can run asphalt
calculators with no account, and a signed-in company can manage projects, route
geometry, GDOT document import, daily logs, loads, mixes, equipment, and crews.

The product branch is **`feat/auth-and-data`**. `main` last moved on June 1, 2026
and is still the early calculator. On November 13, 2026, [paverate.com](https://paverate.com)
was still that calculator (`/login` 404), while [dev.paverate.com](https://dev.paverate.com)
was serving the project app (sign-in and projects). Deploy settings were not
changed. See [STATUS.md](STATUS.md) before promoting this branch to `main`.

## What you can do

**Without an account** (`/app`, also installed as a PWA): spread rate, production
check, feet left, distance planner, tonnage, tack, stick check, paving window,
plus soil, concrete, grading, and specialty calculators. Math runs in the
browser from `src/lib/config/paverate.yaml` and `src/lib/config/formulas.ts`.

**With an account:** organizations and roles, a project workspace (command,
plan, production, resources, records), in-project calculators prefilled from
the job, daily logs and per-load tickets, equipment and mix libraries, a
roads-only MapLibre map, GDOT / contract PDF import, and a global admin console.

## Stack

- SvelteKit 5 (runes) and `@sveltejs/adapter-cloudflare`
- Cloudflare Pages, with D1 (`DB` / `paverate-db`) and R2 (`ASSETS_BUCKET` / `paverate-org-assets`)
- Workers AI binding `AI`, plus AWS Bedrock (Claude) as the primary PDF structurer
- MapLibre GL for maps. PWA via `@vite-pwa/sveltekit`
- Node.js 22 or newer (`npm ci` fails on older Node)

## Local setup

```bash
npm ci
npx wrangler d1 migrations apply paverate-db --local
npm run dev          # http://localhost:5173
```

On Windows the same database step is `npm run db:local` (`scripts/db-local.ps1`).
`npm run db:local:reset` wipes and replays migrations.

`vite dev` talks to local D1 and R2 through the adapter's platform proxy
(`wrangler.jsonc`). Open `/login` and use **Dev login (local only)** to seed
`dev@paverate.local`. That button exists only when SvelteKit's `dev` flag is on.

Pages secrets are not injected from the shell. For Bedrock import locally, put
`AWS_BEARER_TOKEN_BEDROCK` in a gitignored `.dev.vars` file and restart the dev
server yourself. Workers AI is often unavailable under `vite dev`; the import
path falls through when the `AI` binding is missing.

```bash
npm run check     # wrangler types --check, svelte-kit sync, svelte-check
npm run test      # vitest (unit, integration, component projects)
npm run test:e2e  # Playwright; starts vite dev (60s webServer timeout)
npm run build     # wrangler types && vite build  — do not add --check
npm run preview   # wrangler pages dev on the built output
```

`--check` on the build script fails Cloudflare Pages because
`worker-configuration.d.ts` does not exist yet. Leave the build script as it is.

## Configuration

Rates, constants, theme tokens, and labels live in
`src/lib/config/paverate.yaml`. Formulas live in `src/lib/config/formulas.ts`.
Spec traceability is in [docs/validation-matrix.md](docs/validation-matrix.md)
and [docs/VALIDATION.md](docs/VALIDATION.md).

## Layout

```
src/routes/            landing, /app calculators, /dashboard, /admin, API
src/lib/components/    UI, map-v2, calculator cards
src/lib/server/        auth, D1 access, PDF extraction, GDOT geometry
src/lib/config/        paverate.yaml + formulas
migrations/            D1 migrations (0001 through 0080)
docs/                  specs, validation, design notes
```

## Tests

GitHub Actions (`.github/workflows/test.yml`) runs on pushes to
`feat/auth-and-data` and on pull requests into `main`. Jobs: svelte-check,
unit, integration, component, and Playwright. Coverage floors in that workflow
are the levels the suite actually meets. They are not an 80% gate.

## More

- [Current status and how to ship](STATUS.md)
- [Validation matrix](docs/validation-matrix.md)
- [Formulas](docs/FORMULAS.md)
- [GDOT tables](docs/GDOT_TABLES.md)

# PaveRate — Project Context

## CRITICAL: Build Script
- The build script MUST be `"build": "wrangler types && vite build"` (WITHOUT --check)
- `--check` fails on Cloudflare Pages because worker-configuration.d.ts doesn't exist pre-build
- DO NOT add `--check` back to the build script

## Architecture
- SvelteKit 5 (runes mode) with `@sveltejs/adapter-cloudflare`
- Cloudflare Pages deployment (auto-deploys from `main`)
- PWA with offline support via `@vite-pwa/sveltekit`
- Config-driven: all formulas, constants, spec rates in `src/lib/config/paverate.yaml`
- Domain: paverate.com

## Key Commands
- `npm run dev` — dev server
- `npm run build` — `wrangler types && vite build`
- `npm run preview` — local Cloudflare Pages preview

## Code Standards
- Svelte 5 runes mode (use `$state`, `$derived`, `$effect`)
- TypeScript strict
- Mobile-first design — minimum 48px touch targets
- Dark mode default, high contrast for outdoor visibility
- All calculations client-side, no backend

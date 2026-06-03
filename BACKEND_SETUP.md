# PaveRate Backend Setup Guide

This document describes the backend data layer built on feat/auth-and-data branch.

## Architecture

- **Database**: Cloudflare D1 (SQLite)
- **API**: SvelteKit server routes (Cloudflare Workers)
- **Auth**: Roll-your-own session-based auth (no third-party providers)

## Database Schema

Located in `migrations/0001_initial_schema.sql`:

- **users** — User accounts with email/password
- **organizations** — Companies/teams  
- **org_members** — User-org relationships with roles (owner/admin/member)
- **job_sites** — Construction sites linked to orgs
- **job_site_assignments** — Users assigned to sites with roles (foreman/operator/inspector)
- **calculations** — Saved calculations linked to job sites
- **sessions** — User sessions for authentication

## API Routes

All routes under `/api/` (implemented as SvelteKit `+server.ts` files):

### Auth
- `POST /api/auth/register` — Create user + org (first user becomes owner)
- `POST /api/auth/login` — Email/password → session token (httpOnly cookie)
- `POST /api/auth/logout` — Invalidate session
- `GET /api/auth/me` — Current user + org info

### Organizations
- `GET /api/org` — Get current org details
- `POST /api/org/invite` — Invite user by email (owner/admin only)
- `GET /api/org/members` — List org members

### Job Sites
- `GET /api/job-sites` — List job sites for org
- `POST /api/job-sites` — Create job site
- `PATCH /api/job-sites/[id]` — Update job site
- `GET /api/job-sites/[id]/assignments` — List assigned users
- `POST /api/job-sites/[id]/assignments` — Assign user to site

### Calculations
- `GET /api/calculations` — List calculations (filterable by `?job_site_id=`)
- `POST /api/calculations` — Save a calculation
- `GET /api/calculations/[id]` — Get single calculation detail

## Server Helpers

### `src/lib/server/db.ts`
`DbHelper` class with methods for all database operations:
- User management (create, get by email/id)
- Organization management (create, get by user)
- Job site CRUD
- Calculation storage and retrieval
- Session management

### `src/lib/server/auth.ts`
Auth utilities:
- `hashPassword()` — PBKDF2 with 100K iterations
- `verifyPassword()` — Verify password against hash
- `createSession()` — Generate session token
- `getAuthUser()` — Extract user from session cookie
- `requireAuth()` — Middleware helper (throws 401 if not authenticated)

## Setup Instructions

### 1. Create D1 Database

```bash
npx wrangler d1 create paverate-db
```

Copy the database ID from output and update `wrangler.jsonc`:

```json
{
  "d1_databases": [{
    "binding": "DB",
    "database_name": "paverate-db",
    "database_id": "paste-your-id-here"
  }]
}
```

### 2. Run Migrations

PaveRate has three D1 environments, all named `paverate-db`:

- **local** — SQLite under `.wrangler/` used automatically by `vite dev`
- **dev** — remote D1 behind `dev.paverate.com` (real data)
- **prod** — production D1

**Local (one command):**
```bash
npm run db:local        # apply all migrations to the local D1
npm run db:local:reset  # wipe local D1 and re-apply from scratch
```

This applies every `migrations/0*.sql` file in sorted order via
`wrangler d1 execute --local`. It deliberately avoids
`wrangler d1 migrations apply` because two migration numbers are duplicated
(`0024_*`, `0025_*`) and the nested `migrations/migrations/` folder is leftover
cruft.

**Production:**
```bash
npx wrangler d1 execute paverate-db --remote --file=./migrations/0001_initial_schema.sql
```

### 2b. (Optional) Load real dev data into local

```bash
npm run db:pull-dev
```

Exports the remote dev D1 to `.wrangler/dev-snapshot.sql` and loads it into the
local D1 so you can test against real captured data. Requires `wrangler login`.

### 3. Test Locally

```bash
npm run db:local   # one-time: bootstrap the local D1
npm run dev
```

Then use the dev-only login button on `/login` (seeds a known dev user + org),
or register a user via the API:
```bash
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "orgName": "Test Paving Co"
  }' \
  -c cookies.txt
```

Get current user:
```bash
curl http://localhost:5173/api/auth/me -b cookies.txt
```

## Important Notes

- **No auth gates on existing pages** — The public calculator on `/` and `/reference` works without authentication
- **Auth is opt-in** — Users can use the calculator anonymously; auth is only required for saved calculations and multi-user features
- **Free tier only** — No third-party auth providers, everything runs on Cloudflare's free tier
- **Build script unchanged** — Still `"build": "wrangler types && vite build"` (no --check flag)

## Next Steps

To complete the feature:
1. Build UI pages for `/login`, `/register`, `/dashboard`
2. Add "Save Calculation" buttons to calculator pages (only visible when authenticated)
3. Create dashboard to view saved calculations and job sites
4. Add org management UI for inviting users

## Type Definitions

Custom D1 types in `src/cloudflare.d.ts` provide TypeScript support for Cloudflare Workers D1 database.

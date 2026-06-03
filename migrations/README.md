# PaveRate Database Migrations

This directory contains D1 database migration files for PaveRate.

## Three D1 environments

PaveRate has three separate D1 databases (all named `paverate-db`):

- **local** — a SQLite file under `.wrangler/` that `vite dev` uses automatically
  (adapter-cloudflare reads `wrangler.jsonc` and exposes it as
  `event.platform.env.DB`).
- **dev** — the remote D1 behind `dev.paverate.com` (real data).
- **prod** — the production D1.

Populate local either by using the app yourself or by pulling a real snapshot
from the dev D1 (`npm run db:pull-dev`). Do not invent sample data.

## Setup

### 1. Create the D1 database

```bash
npx wrangler d1 create paverate-db
```

This will output a database ID. Copy it and update `wrangler.jsonc`:

```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "paverate-db",
      "database_id": "your-database-id-here"
    }
  ]
}
```

### 2. Bootstrap the local database (one command)

```bash
npm run db:local
```

This applies every top-level migration in `migrations/0*.sql` to the **local**
D1 in sorted order, one file at a time. To rebuild from scratch:

```bash
npm run db:local:reset
```

> Why a script and not `wrangler d1 migrations apply`: two migration numbers are
> duplicated (`0024_*`, `0025_*`) and a nested `migrations/migrations/` folder is
> leftover cruft, so the standard migrations command is unreliable here. The
> script applies each top-level file once, in filename order, and ignores the
> nested folder. The duplicate-numbered files touch disjoint tables, so order
> between them does not matter.

To apply migrations in production instead:

```bash
npx wrangler d1 execute paverate-db --remote --file=./migrations/0001_initial_schema.sql
# ...repeat for each file through 0033, in order...
```

> Migrations must be applied strictly in numeric order — later files depend on
> tables/columns created by earlier ones (e.g. `0030_loads_ticket_photo.sql`
> references `photo_attachments` from `0011`).

### 3. (Optional) Load real dev data into local

```bash
npm run db:pull-dev
```

Exports the remote dev D1 to `.wrangler/dev-snapshot.sql` and loads it into the
local D1. Requires an authenticated wrangler session (`wrangler login`).

## Testing the API locally

After bootstrapping the local DB (`npm run db:local`), start the dev server:

```bash
npm run dev
```

The fastest path is the dev-only login button on `/login`, which seeds a known
dev user + org and issues a session (gated behind SvelteKit's `dev` flag, absent
in production). Alternatively, drive the auth endpoints directly:

```bash
# Register a new user
curl -X POST http://localhost:5173/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "orgName": "Test Paving Co"
  }'

# Login
curl -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }' \
  -c cookies.txt

# Get current user (requires session cookie)
curl http://localhost:5173/api/auth/me \
  -b cookies.txt
```

## Database Schema

- **users** — user accounts with email/password
- **organizations** — companies/teams
- **org_members** — user-org relationships with roles (owner/admin/member/foreman/operator/inspector/office)
- **job_sites** — construction sites linked to orgs
- **job_site_assignments** — users assigned to sites with roles (foreman/operator/inspector)
- **calculations** — saved calculations linked to job sites
- **sessions** — user sessions for authentication
- **crews** — named crew groups within orgs (migration 0013)
- **crew_members** — members assigned to crews (one crew per member per org)

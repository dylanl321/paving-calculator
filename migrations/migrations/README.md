# PaveRate Database Migrations

This directory contains D1 database migration files for PaveRate.

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

### 2. Run migrations locally

```bash
npx wrangler d1 execute paverate-db --local --file=./migrations/0001_initial_schema.sql
```

### 3. Run migrations in production

```bash
npx wrangler d1 execute paverate-db --remote --file=./migrations/0001_initial_schema.sql
```

## Testing the API locally

After running migrations locally, start the dev server:

```bash
npm run dev
```

Test the auth endpoints:

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
- **crews** — named crew groups within orgs (migration 0011)
- **crew_members** — members assigned to crews (one crew per member per org)

# DB Layer Decomposition Plan

## Overview

`src/lib/server/db.ts` is 2067 lines and exports 91 methods across a single `DbHelper` class.
It handles Auth, Users, Organizations, Job Sites, Equipment, DOT data, Email, and more.
This document plans the breakup into domain-scoped modules.

## Current State

### Already-extracted Helpers (partial decomposition done)

The following domain modules already exist as standalone helpers (not part of DbHelper):

| File | Class | Domain |
|---|---|---|
| `db-logs.ts` | `DbLogHelper` | Daily logs, log entries, progress |
| `db-milestones.ts` | `DbMilestoneHelper` | Milestones per job site |
| `db-photos.ts` | `DbPhotoHelper` | Photo uploads and retrieval |
| `db-crews.ts` | `DbCrewHelper` | Crew locations and productivity |
| `db-webhooks.ts` | `DbWebhookHelper` | Webhooks and deliveries |
| `db-audit.ts` | (functional) | Audit event recording |

These already follow the target pattern (separate class, same D1Database constructor arg).
The decomposition should bring `db.ts` into the same shape.

### Methods in DbHelper by Domain

#### Auth / Sessions (9 methods)
- `createSession(userId, expiresAt)` - creates token-based session
- `getSession(token)` - lookup session + user join
- `deleteSession(token)` - logout single session
- `deleteSessionsByUserId(userId)` - logout all (admin force-logout)
- `getSessionsByUserId(userId)` - list sessions (admin view)
- `cleanExpiredSessions()` - maintenance purge
- `createEmailToken(userId, type, expiresInSeconds)` - password reset / verify tokens
- `getEmailToken(token, type)` - validate a token
- `markEmailTokenUsed(token)` - consume a token

#### Auth / Users (8 methods)
- `getUserByEmail(email)`
- `getUserById(id)`
- `createUser(email, passwordHash, name)`
- `deleteUser(id)`
- `updateUser(id, updates)` - name, email, phone, admin flag, disabled
- `setEmailVerified(id, verified?)`
- `updatePassword(userId, passwordHash)`
- `getNotificationPrefs(userId)` / `bulkSetNotificationPrefs(userId, prefs)` (2)

#### Org / Organization (14 methods)
- `createOrganization(name, slug)`
- `getOrgByUserId(userId)` - gets current user's org
- `getOrgBySlug(slug)`
- `getOrganizationById(id)`
- `getAllOrganizations()` - admin use
- `updateOrganization(id, updates)` - name, slug, address, superintendent
- `setOrganizationArchived(id, archived)`
- `getOrgsNeedingAttention()` - admin dashboard
- `getRecentOrganizations(limit?)` - admin dashboard
- `getJobSiteCountByOrgId(orgId)` - admin stat
- `getOrgSettings(orgId)`
- `upsertOrgSettings(orgId, updates)` - branding, email from, recipients
- `getEmailReportSchedules(orgId)`
- `upsertEmailReportSchedule(orgId, reportType, data)`
- `deleteEmailReportSchedule(id, orgId)`
- `markEmailReportScheduleSent(id, sentAt)` (16 total)

#### Org / Members & Invitations (10 methods)
- `addOrgMember(userId, orgId, role)`
- `getOrgMembersByOrgId(orgId)`
- `getUserRole(userId, orgId)`
- `getUserMember(userId, orgId)`
- `getUserMemberships(userId)` - all orgs a user belongs to
- `removeOrgMember(userId, orgId)`
- `updateOrgMemberRole(userId, orgId, role)`
- `createInvitation(orgId, email, role, invitedBy, expiresAt)`
- `getInvitationsByOrgId(orgId)`
- `getInvitationByToken(token)`
- `getInvitationById(id)`
- `getInvitationByEmail(orgId, email)`
- `acceptInvitation(token)`
- `deleteInvitation(id)`
- `cleanExpiredInvitations()` (15 total)

#### Job Sites / Core (6 methods)
- `createJobSite(orgId, name, ...)`
- `getJobSitesByOrgId(orgId)`
- `getJobSiteById(id)`
- `updateJobSite(id, updates)`
- `setJobSiteContractMeta(id, meta)` - contract #, PI #, route, county, district etc.
- `getJobSiteAssignments(jobSiteId)` / `assignUserToJobSite(jobSiteId, userId, role)` (8 total)

#### Job Sites / Config & Mixes (9 methods)
- `getJobSiteConfig(jobSiteId)` - road type, lanes, mix type, thickness, spread rate
- `upsertJobSiteConfig(jobSiteId, config)`
- `getProductionMixes(jobSiteId)`
- `createProductionMix(jobSiteId, data)`
- `getProductionMix(mixId)`
- `updateProductionMix(mixId, updates)`
- `setActiveMix(jobSiteId, mixId)`
- `deleteProductionMix(mixId)`
- `deleteProductionMixes(jobSiteId)`

#### Job Sites / Bid Items (3 methods)
- `getBidItems(jobSiteId)`
- `createBidItem(jobSiteId, data)`
- `deleteBidItems(jobSiteId)`

#### Job Sites / Documents & Schematics (6 methods)
- `getSchematics(jobSiteId)`
- `getSchematic(id)`
- `createSchematic(jobSiteId, name, r2Key, contentType, size, uploadedBy)`
- `getJobDocuments(jobSiteId)`
- `getJobDocument(id)`
- `createJobDocument(jobSiteId, name, r2Key, contentType, size, uploadedBy)`

#### Equipment (3 methods)
- `getJobSiteEquipment(jobSiteId)`
- `createJobSiteEquipment(jobSiteId, data)`
- `deleteJobSiteEquipment(equipmentId)`

#### Job Sites / Route (2 methods)
- `getJobSiteRoute(jobSiteId)`
- `upsertJobSiteRoute(jobSiteId, waypoints, ...)`

#### Loads (0 methods in DbHelper)
Loads are queried inline in route handlers using `platform!.env.DB.prepare(...)` directly.
These should be extracted to `db-loads.ts` as part of this decomposition.

Tables involved: `job_loads`, `job_trucks`

#### DOT Data (5 methods)
- `upsertDotSegment(stateDot, source, data)`
- `getDotSegmentsByState(stateDot, limit?)`
- `getDotSegmentsByRoute(stateDot, routeId)`
- `logDotSync(stateDot, source, recordsProcessed, ...)`
- `getLastDotSync(stateDot, source)`

#### Email Log (2 methods)
- `logEmail(entry)` - records an email send attempt
- `getEmailLog(filters?)` - admin email history with filters + pagination

#### Admin / Cross-Domain Queries (4 methods)
- `getAdminStats()` - aggregate counts across orgs, users, job sites, emails
- `getRecentUsers(limit?)` - admin dashboard
- `getAllUsers()` - admin users list with memberships join
- `getJobSiteCountByOrgId(orgId)` - used by admin org detail

#### Calculations (3 methods)
- `createCalculation(userId, jobSiteId, type, inputs, result)`
- `getCalculations(filters?)`
- `getCalculationById(id)`

---

## Target File Structure

```
src/lib/server/
  db.ts              <- KEEP: DbHelper class, types, thin coordinator
  db-auth.ts         <- NEW: sessions, email tokens, password ops
  db-users.ts        <- NEW: user CRUD, notification prefs (extracted from db.ts)
  db-org.ts          <- NEW: org CRUD, settings, email report schedules
  db-members.ts      <- NEW: org_members, invitations
  db-jobsites.ts     <- NEW: job site CRUD, contract meta, assignments, config, mixes, bid items, docs, schematics, route
  db-equipment.ts    <- NEW: job_site_equipment (small, standalone)
  db-loads.ts        <- NEW: job_loads and job_trucks (currently inline in routes)
  db-dot.ts          <- NEW: dot segments, dot sync log
  db-email-log.ts    <- NEW: email_log table
  db-calculations.ts <- NEW: calculations table
  db-admin.ts        <- NEW: cross-domain admin queries (getAdminStats, getOrgsNeedingAttention, etc.)
  // Already extracted:
  db-logs.ts         <- KEEP as-is
  db-milestones.ts   <- KEEP as-is
  db-photos.ts       <- KEEP as-is
  db-crews.ts        <- KEEP as-is
  db-webhooks.ts     <- KEEP as-is
  db-audit.ts        <- KEEP as-is
```

### DbHelper Pattern After Decomposition

The `DbHelper` class stays but becomes a thin facade that delegates to domain modules.
All existing call sites remain unchanged because they still call `db.<method>()`.

```typescript
// db.ts (after)
import { DbAuthModule } from './db-auth';
import { DbUsersModule } from './db-users';
import { DbOrgModule } from './db-org';
// ...

export class DbHelper {
  private auth: DbAuthModule;
  private users: DbUsersModule;
  private org: DbOrgModule;
  // ...

  constructor(private db: D1Database) {
    this.auth = new DbAuthModule(db);
    this.users = new DbUsersModule(db);
    this.org = new DbOrgModule(db);
    // ...
  }

  // Thin delegation
  createSession(userId: string, expiresAt: number) {
    return this.auth.createSession(userId, expiresAt);
  }
  // ...
}
```

Alternatively (simpler): each domain module exports standalone functions that accept `D1Database`
as their first argument, and `DbHelper` methods become one-liner wrappers. This avoids nested
class instantiation on every request.

---

## Files Currently Importing from db.ts

107 route/server files import from `$lib/server/db`. They all do one of:

1. `import { DbHelper } from '$lib/server/db'` - 103 files (use the class)
2. `import type { DbXxx } from '$lib/server/db'` - 4 files (type-only)

Type exports to preserve in `db.ts` (or re-export from there after moving):
- `DbUser`, `DbOrganization`, `DbOrgMember`, `DbJobSite`, `JobSiteContractMeta`
- `DbBidItem`, `DbProductionMix`, `DbSchematic`, `DbJobDocument`, `DbJobSiteAssignment`
- `DbCalculation`, `DbLoad`, `DbSession`, `DbOrgSettings`, `DbInvitation`
- `DbJobSiteConfig`, `DbJobSiteEquipment`, `DbJobSiteRoute`, `DbRoadSection`
- `DbNotificationPref`, `DbEmailLog`, `DbCrewLocation`, `DbEmailReportSchedule`
- Re-exports: `DbDotRoadSegment`, `DbDotSyncLog` (from `$lib/types/dot`)

**All type imports from `$lib/server/db` must continue to work without changes to callers.**
Types can stay in `db.ts` or be re-exported via `export type { ... } from './db-xxx'`.

---

## Migration Order (Least Coupled First)

Extract in this order to minimize cross-domain dependencies at each step:

### Phase 1 - Standalone, no cross-domain deps
1. **`db-dot.ts`** - `upsertDotSegment`, `getDotSegmentsByState`, `getDotSegmentsByRoute`, `logDotSync`, `getLastDotSync`
   - Only used by `/api/admin/dot-ingest` and `/api/dot/segments`
   - Zero dependencies on other DbHelper methods
2. **`db-email-log.ts`** - `logEmail`, `getEmailLog`
   - Only used by email sender and `/api/admin/emails`
   - Zero dependencies on other DbHelper methods
3. **`db-calculations.ts`** - `createCalculation`, `getCalculations`, `getCalculationById`
   - Only used by `/api/calculations`
   - Zero dependencies on other DbHelper methods
4. **`db-equipment.ts`** (KEEP name, move from db.ts) - `getJobSiteEquipment`, `createJobSiteEquipment`, `deleteJobSiteEquipment`
   - Small surface, only used by `/api/job-sites/[id]/equipment`

### Phase 2 - Auth layer (depends only on users table)
5. **`db-auth.ts`** - sessions + email tokens + password ops
   - `createSession`, `getSession`, `deleteSession`, `deleteSessionsByUserId`, `getSessionsByUserId`, `cleanExpiredSessions`
   - `createEmailToken`, `getEmailToken`, `markEmailTokenUsed`, `updatePassword`
   - Used widely by auth routes but no cross-method dependencies

### Phase 3 - User layer
6. **`db-users.ts`** - user CRUD + notification prefs
   - `getUserByEmail`, `getUserById`, `createUser`, `deleteUser`, `updateUser`, `setEmailVerified`
   - `getNotificationPrefs`, `bulkSetNotificationPrefs`
   - `getAllUsers`, `getRecentUsers` (used only by admin routes)

### Phase 4 - Org + Members
7. **`db-members.ts`** - org members + invitations
   - All invitation and org_member methods
   - Depends on: nothing from DbHelper
8. **`db-org.ts`** - org CRUD + settings + email report schedules
   - Depends on: nothing from DbHelper, references org_members table indirectly via admin queries

### Phase 5 - Job Sites (largest domain)
9. **`db-jobsites.ts`** - everything job-site scoped
   - Core CRUD, config, mixes, bid items, documents, schematics, route, assignments
   - This is the largest extraction (~600 lines from db.ts)

### Phase 6 - Loads (currently inline in routes)
10. **`db-loads.ts`** - extract from route handlers
    - `job_loads` table: list loads by job site/log, create load, update load status
    - `job_trucks` table: list trucks, create truck, update truck status/arrival
    - Routes currently doing raw D1 calls: `loads/+server.ts`, `loads/scan/+server.ts`, `loads/[loadId]/reject/+server.ts`, `trucks/+server.ts`, `trucks/[truckId]/+server.ts`

### Phase 7 - Admin module
11. **`db-admin.ts`** - cross-domain admin queries
    - `getAdminStats`, `getOrgsNeedingAttention`, `getJobSiteCountByOrgId`
    - These join across tables; keep together or inline in admin routes

---

## Import Path Changes After Decomposition

### For call sites using DbHelper (no change needed if facade stays)
All 103+ files that do `new DbHelper(platform!.env.DB)` continue to work unchanged.

### For routes wanting domain-specific helpers
Routes that want to use new domain helpers directly (like logs/milestones already do):

```typescript
// Before: all from db
import { DbHelper } from '$lib/server/db';

// After: still works (DbHelper delegates)
import { DbHelper } from '$lib/server/db';

// Or: opt into direct helper (new pattern, for new code)
import { DbLoadsHelper } from '$lib/server/db-loads';
```

### Type imports (no change needed)
All types remain re-exported from `$lib/server/db`:
```typescript
import type { DbJobSite, DbLoad } from '$lib/server/db'; // still works
```

---

## Estimated Work Per Phase

| Phase | Files to Create/Modify | Lines Moved | Risk |
|---|---|---|---|
| 1 - Standalone | 4 new files | ~120 lines | Low |
| 2 - Auth | 1 new file, db.ts shrinks | ~80 lines | Low |
| 3 - Users | 1 new file, db.ts shrinks | ~100 lines | Low |
| 4 - Org+Members | 2 new files, db.ts shrinks | ~280 lines | Low |
| 5 - Job Sites | 1 new large file | ~600 lines | Medium |
| 6 - Loads (inline routes) | 1 new file + 5 route files | ~200 lines extracted | Medium |
| 7 - Admin | 1 new file | ~80 lines | Low |

After all phases: `db.ts` should shrink from 2067 lines to ~400 lines
(type definitions + DbHelper facade + re-exports).

---

## Conventions for New Domain Files

Each domain file follows the pattern already established by `db-logs.ts`:

```typescript
import type { D1Database } from '../../cloudflare';

// Type exports
export interface DbFoo { ... }

// Helper class
export class DbFooHelper {
  constructor(private db: D1Database) {}

  async getFoo(id: string): Promise<DbFoo | null> {
    return await this.db.prepare('SELECT * FROM foos WHERE id = ?').bind(id).first<DbFoo>();
  }
}
```

Types that need to be accessible from `$lib/server/db` are re-exported in `db.ts`:
```typescript
export type { DbFoo } from './db-foo';
```

---

## Notes and Risks

1. **`db-loads.ts` requires route changes** - unlike other phases which only touch db.ts,
   extracting loads means modifying 5+ route handler files that currently do raw D1 queries.
   Do this phase last after the pattern is established.

2. **Admin queries span domains** - `getAdminStats` queries 4+ tables. Keep it in `db-admin.ts`
   or inline it in the admin route. Do NOT scatter cross-table joins across domain files.

3. **DbHelper constructor** - currently takes `D1Database`. After decomposition, it instantiates
   multiple sub-helpers in the constructor. Cost is negligible (just object creation, no I/O).

4. **Tree-shaking** - Cloudflare Workers bundle everything anyway. Splitting files improves
   maintainability, not bundle size.

5. **Sections routes use raw D1** - `sections/+server.ts` and `sections/[sectionId]/+server.ts`
   use `event.platform!.env.DB.prepare(...)` directly. These could be moved to `db-jobsites.ts`
   as a follow-up but are not urgent.

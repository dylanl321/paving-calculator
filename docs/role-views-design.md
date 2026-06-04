# Role-Based Views Design

*This is a UX simplification layer, not a security boundary. All server-side auth
gates remain in place regardless of which view a role lands on.*

---

## 1. Current Roles

| Role | Who | Org scope |
|------|-----|-----------|
| `owner` | Org creator / account holder | Full org access |
| `admin` | Org admin invited by owner | Full org access |
| `member` | Generic authenticated member (legacy/fallback) | Same as full for now |
| `foreman` | Crew foreman — oversees a job site | Crew-scoped access |
| `operator` | Equipment operator on a job | Field access |
| `inspector` | QA / density / materials inspector | Field access |
| `office` | Office staff / PM / billing | Dashboard access, no field tools |
| `laborer` | General laborer — logging + calc only | Field access |
| `screed_man` | Screed operator — calc-only simplified view | Screed-only |

These are stored in `org_members.role` and surfaced via `authStore.org.role` on the
client. Role helpers live in `src/lib/server/auth.ts`.

---

## 2. View Tiers

### 2a. full — `/dashboard`

**Roles**: `owner`, `admin`, `foreman`

These users need the complete project-management surface.

What they see:
- `/dashboard` — job-site overview cards, daily summary stats, map
- `/dashboard/job-sites/[id]` — full project: overview, config, logs, map, crew
- `/dashboard/job-sites/[id]/log` — today's paving log (open/close, loads, density)
- `/dashboard/team` — member roster, roles, invite flow
- `/dashboard/settings` — org settings, logo, defaults
- `/dashboard/activity` — org-level audit log
- `/dashboard/map` — fleet / crew map
- `/dashboard/guides` — onboarding guides
- `/app` — Quick Calc workspace (all calculators, foreman also uses this on the field tablet)
- `owner`/`admin` also see `/dashboard/admin/*` (org-activity, crew-productivity reports)

### 2b. field — `/app/field` (planned route, not yet built)

**Roles**: `laborer`, `operator`

These users are on the ground and need the minimum surface to do their job:
load entry and distance tracking. They do not manage projects or view org settings.

What they see (planned):
- Load counter — tap to log a truck load for the active job site
- Distance / footage completed (read from active job site log)
- Simple tonnage display (live tons logged today vs. daily target)
- Job site name + status badge (which site they are assigned to)

What they do NOT see:
- Dashboard, job-site config, org settings
- Team management or invite flows
- Admin reports
- Full calculator workspace (all the spread-rate / tack / DOT tools)
- Any navigation beyond their single-screen task view

How to switch back:
- This is a UX routing decision at login time, not a lock. An admin can change a user's
  role in `/dashboard/team`, which will update `org_members.role`. On next page load
  (or session refresh via `authStore.fetch()`), the routing logic re-evaluates and sends
  the user to the appropriate view. No separate "switch view" button is planned — role
  change is the mechanism.
- A `foreman` acting as a laborer for a day would have their role temporarily updated by
  an admin, then restored. This is intentional: role = view tier.

*Note: `/app/field` is the planned destination. Until that route is built, `laborer` and
`operator` land on `/app` (Quick Calc). The routing guard should be implemented when the
field-entry page is created — see child task `t_9ae7f1d0`.*

### 2c. screed — `/app`

**Roles**: `screed_man`

The existing `ScreedManView` component already handles this. When `authStore.org.role === 'screed_man'`,
`/app/+page.svelte` renders `<ScreedManView>` instead of the full workspace.

What they see (`ScreedManView`):
- SpreadRateCard — live spread rate vs. target
- BatchSpreadRateCheck — compare batches
- StickCheckCard — loose height check
- FeetLeftCard — distance left today

What they do NOT see:
- Tool picker sidebar (all calculators)
- JobBar (job context selector)
- Live Rates chart panel
- Any dashboard routes

How to switch back: same mechanism as field — admin changes the role, next session gets
the updated view.

### 2d. office — `/dashboard`

**Roles**: `office`

Same destination as `full` for now. Office staff need to see project status, reports,
and settings but typically don't operate in the field.

Future differentiation (not in scope for this ticket):
- Hide field-only calculator tools
- Surface billing/contract views when that feature ships

---

## 3. Routing Logic

The routing decision point is the post-login redirect in `src/routes/login/+page.svelte`
(client side) and the root layout or dashboard layout load functions.

### Role-to-view mapping

```ts
// src/lib/utils/role-routing.ts  (to be created when routing is implemented)

export type ViewTier = 'full' | 'field' | 'screed' | 'office';

export function viewTierForRole(role: string): ViewTier {
  switch (role) {
    case 'owner':
    case 'admin':
    case 'foreman':
    case 'member':   // legacy fallback — treat as full for now
      return 'full';

    case 'laborer':
    case 'operator':
      return 'field';

    case 'screed_man':
      return 'screed';

    case 'office':
    case 'inspector': // inspectors need dashboard for density logs review
      return 'office';

    default:
      return 'full'; // safest fallback — never silently hide data
  }
}

export function defaultRouteForTier(tier: ViewTier): string {
  switch (tier) {
    case 'full':
    case 'office':
      return '/dashboard';
    case 'field':
      return '/app/field';   // once built; interim: '/app'
    case 'screed':
      return '/app';
  }
}
```

### Where the redirect fires

1. **Post-login** (`/login`): after a successful `authStore.login()`, redirect to
   `defaultRouteForTier(viewTierForRole(authStore.org.role))`.

2. **Root index** (`/` for authenticated users): the landing page already links to
   `/app` and `/login`. Once the user is authenticated, the home route can redirect
   using the same mapping.

3. **`screed_man` in `/app`**: already handled inline in `/app/+page.svelte` via
   `const isScreedMan = $derived(authStore.org?.role === 'screed_man')`. This stays
   as-is — no regression needed.

4. **`laborer`/`operator` reaching `/dashboard`**: server-side layout load for
   `/dashboard/+layout.server.ts` should check role. If the role is `field`-tier,
   redirect to `/app` (or `/app/field` once built). This prevents accidental dashboard
   access without requiring a separate auth gate.

---

## 4. Inspector Role Clarification

`inspector` sits between field and office. They need:
- Density reading entry (part of the daily log in `/dashboard/job-sites/[id]/log`)
- Basic job-site view to navigate to the log

They do NOT typically need:
- Org settings, team management, or admin reports

Current assignment: `office` tier (lands on `/dashboard`). This gives them access to
the log. Future work could give them a narrower "inspector view" of the log page only,
but that is out of scope here.

---

## 5. What Is NOT Changing

- Server-side `requireOrgRole(...)` guards on API endpoints — these remain the actual
  security boundary and are unaffected by this routing design.
- The `ADMIN_ROLES`, `FIELD_ROLES`, `LABORER_ROLES` constants in `auth.ts`.
- The existing `ScreedManView` component — it already works correctly.
- Offline calculator access at `/app` for unauthenticated users — role routing only
  applies when a user is logged in with an org role.

---

## 6. Implementation Checklist (for follow-on tasks)

- [ ] Create `src/lib/utils/role-routing.ts` with `viewTierForRole` / `defaultRouteForTier`
- [ ] Update `/login/+page.svelte` to redirect using `viewTierForRole`
- [ ] Add role-tier guard to `/dashboard/+layout.server.ts` to redirect field-tier roles
- [ ] Build `/app/field` route (load-entry + distance; see child task `t_9ae7f1d0`)
- [ ] Wire `laborer`/`operator` to `/app/field` once that route exists
- [ ] Test: log in as each role, verify landing route, verify back-navigation is absent

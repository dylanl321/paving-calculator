# Job Configuration Completeness Tracking

Version: 1.0 | Status: Draft | Author: paverate-dev

---

## 1. Purpose

Completeness tracking gives org admins and managers a single-glance answer to:
"Are our jobs configured well enough to run production correctly?"

It does not gate any workflow. A job with a low score still operates. The score
surfaces missing data so someone can fill it in before boots hit the ground.

---

## 2. Defining "Complete"

A job site has three concentric rings of data quality:

### Ring 1 — Operational Minimum (required)

Fields that, if absent, break at least one calculator or daily-log workflow:

| Table | Column | Why it matters |
|---|---|---|
| job_sites | name | Displayed everywhere |
| job_sites | status | Drives active/archived filters |
| job_site_config | road_type | Required for spread rate calc |
| job_site_config | num_lanes | Required for tonnage calc |
| job_site_config | lane_width_ft | Default exists (12), warn if null |
| job_site_config | total_length_ft | Required for feet-left calc |
| job_site_config | scope_of_work | Required for foreman UI context |
| job_site_config | mix_type | Required for plant ticket matching |
| job_site_config | target_thickness_in | Required for spread rate calc |
| job_site_config | target_spread_rate | Required for production targets |

Score weight: each field = 8 points. 10 fields = 80 points max.

### Ring 2 — Operational Best Practice (optional-but-important)

Fields that improve accuracy, reporting, and daily-log quality:

| Table | Column | Why it matters |
|---|---|---|
| job_site_config | tack_type | Tack calc enabled |
| job_site_config | target_tack_rate | Tack calc enabled |
| job_site_config | num_lifts | Multi-lift job tracking |
| job_site_config | total_tonnage | Closeout reporting |
| job_sites | latitude / longitude | Map view, crew proximity |
| job_sites | est_start_date | Schedule / milestone tracking |
| job_sites | completion_date | Project timeline |
| job_sites | customer_name | Billing and reports |
| job_sites | project_manager | Accountability |
| daily_logs (any) | at least one daily log exists | Shows job is active |

Score weight: each satisfied = 2 points. 10 checks = 20 points max.

### Ring 3 — Contract & Compliance (advisory only, no score impact)

Present or absent, these do not affect the score. They appear in a separate
"contract data" section on the UI:

- job_number, project_number, contract_id
- gdot_county, gdot_district
- job_bid_items (count)
- job_production_mixes (count)
- job_documents (count)
- job_site_milestones (count)

These enrich reporting but have no bearing on day-to-day operations.

---

## 3. Score Calculation

```
required_score  = (filled_required_fields / 10) * 80
optional_score  = (satisfied_optional_checks / 10) * 20
total_score     = required_score + optional_score   // 0–100
```

### Status Thresholds

| Score | Status | Label | Color hint |
|---|---|---|---|
| 90–100 | complete | Ready to pave | green |
| 60–89 | needs-attention | Missing best-practice data | yellow |
| 0–59 | incomplete | Missing required fields | red |

Status labels are stable strings for client filtering. Do not localize them at
the API layer.

### Example

A job with all 10 required fields filled + 5 optional checks satisfied:
- required_score = (10/10) * 80 = 80
- optional_score = (5/10) * 20 = 10
- total = 90 → status = "complete"

---

## 4. Per-Site Detail Response

The API returns a `completeness` object on each job site resource. Shape:

```ts
interface SiteCompleteness {
  score: number;           // 0–100
  status: 'complete' | 'needs-attention' | 'incomplete';
  required: {
    filled: number;        // e.g. 8
    total: number;         // always 10
    missing: string[];     // human-readable field names
  };
  optional: {
    satisfied: number;
    total: number;         // always 10
    missing: string[];
  };
  contract_summary: {
    has_job_number: boolean;
    bid_item_count: number;
    mix_count: number;
    document_count: number;
    milestone_count: number;
  };
}
```

`missing` arrays use snake_case field names matching the DB column so the
frontend can deep-link to the correct edit form section.

---

## 5. Org-Wide Completeness View

### Endpoint

```
GET /api/org/completeness
```

Auth: session cookie. Returns data scoped to the caller's organization.

Query params:
- `status` (optional) — filter by completeness status (complete | needs-attention | incomplete)
- `include_archived` (optional, default false) — include archived job sites

### Response Shape

```ts
interface OrgCompletenessResponse {
  org_id: string;
  computed_at: string;      // ISO 8601
  summary: {
    total_sites: number;
    complete: number;
    needs_attention: number;
    incomplete: number;
    avg_score: number;      // 0–100, one decimal
  };
  sites: Array<{
    id: string;
    name: string;
    status: string;         // job status: active | completed | archived
    completeness: SiteCompleteness;
  }>;
}
```

Sites are sorted descending by score (lowest first = attention goes to weakest
jobs). Ties break alphabetically by name.

### Example Response

```json
{
  "org_id": "abc123",
  "computed_at": "2026-06-04T14:00:00Z",
  "summary": {
    "total_sites": 4,
    "complete": 1,
    "needs_attention": 2,
    "incomplete": 1,
    "avg_score": 71.5
  },
  "sites": [
    {
      "id": "site_d",
      "name": "Hwy 41 Overlay",
      "status": "active",
      "completeness": {
        "score": 45,
        "status": "incomplete",
        "required": { "filled": 4, "total": 10, "missing": ["total_length_ft", "scope_of_work", "mix_type", "target_thickness_in", "target_spread_rate", "num_lanes"] },
        "optional": { "satisfied": 2, "total": 10, "missing": ["tack_type", "tack_rate", "num_lifts", "total_tonnage", "coordinates", "est_start_date", "completion_date", "customer_name", "project_manager"] },
        "contract_summary": { "has_job_number": false, "bid_item_count": 0, "mix_count": 0, "document_count": 0, "milestone_count": 0 }
      }
    }
  ]
}
```

---

## 6. Implementation Notes

### Computation

Completeness is computed on-read (not stored). The query joins:
- job_sites
- job_site_config (LEFT JOIN — config may not exist yet)
- daily_logs (COUNT, for optional check)
- job_bid_items (COUNT)
- job_production_mixes (COUNT)
- job_documents (COUNT)
- job_site_milestones (COUNT)

This is one SQL query with aggregates. For orgs with fewer than 200 active sites
the latency is acceptable without caching. If an org grows past that threshold,
the endpoint can add a `Cache-Control: max-age=60` header and a KV-backed
stale-while-revalidate layer.

### Server Route File

Create: `src/routes/api/org/completeness/+server.ts`

Logic lives in a utility: `src/lib/server/completeness.ts`

Separating the scoring logic from the route handler makes it testable in
isolation and reusable if we expose completeness as part of a job-site GET.

### Scoring Helper Signature

```ts
export function scoreJobSite(row: JobSiteCompletenessRow): SiteCompleteness
```

`JobSiteCompletenessRow` is a flat object from the SQL join containing all
columns needed for scoring. The helper is pure (no DB access) so it can run
in unit tests or edge workers without a D1 binding.

---

## 7. UI Integration Points (future tasks)

These are out of scope for this design task but recorded here to inform
downstream work:

1. Job list page — add color-coded completeness badge next to each site name.
2. Job detail page — completeness widget in the sidebar with quick links to
   each missing section.
3. Admin dashboard — org-wide completeness chart (score distribution histogram).
4. Notification / email digest — weekly "jobs needing attention" report using
   `needs-attention` and `incomplete` counts.

---

## 8. Open Questions

1. Should "at least one assigned foreman" count as an optional check?
   (Currently crews are tracked but foreman assignment is implicit via
   job_site_assignments. May add in v2.)
2. Should completeness score appear in the org activity feed when a job
   transitions status thresholds?
3. Does the score need to be stored historically (e.g. to show "score went from
   45 to 90 this week")? Current design computes on-read; add a
   completeness_snapshots table in v2 if trending is required.

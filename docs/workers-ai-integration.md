# Workers AI Integration Design — PaveRate

**Status:** Design only — no implementation yet
**Date:** 2026-06-05
**Author:** paverate-dev

---

## Background

Cloudflare Workers AI is already bound as `AI` in `wrangler.jsonc` and accessible
in every endpoint via `event.platform.env.AI`. It is currently used in exactly one
place: `src/lib/server/pdf/llm-fallback.ts` runs `@cf/meta/llama-3.1-8b-instruct-fast`
to gap-fill low-confidence geographic/identity fields that the deterministic GDOT
regex parser couldn't extract with confidence.

**Neuron budget (verified June 2026 docs):**
- 10,000 Neurons/day free on both Free and Paid plans
- $0.011 / 1,000 Neurons overage on Paid only (Free plan hard-walls and fails)
- All Workers AI calls should be best-effort: fall back to the deterministic or
  manual path on any error, never block the user

---

## Feature 1: Document Classification (Immediate Priority)

### Problem

`detectDocumentType()` in `src/lib/server/pdf/parse-gdot.ts` currently classifies
documents with three simple regex patterns:

```
job_setup | contract_summary | unknown
```

The `unknown` bucket is a catch-all that includes roadway-log plan sheets, weight
slips embedded in contract PDFs, aggregate/material certs, and anything else a crew
foreman might upload. The parser router passes `unknown` docs into a generic parse
path that often extracts nothing useful.

### Goal

Before invoking any regex parser, classify the PDF into one of the known document
types. Return the classification and a confidence to the UI immediately so users see
what PaveRate thinks they uploaded before the parse completes.

### Document Types

```ts
export type DocumentClass =
  | 'gdot_contract'        // GDOT proposal / schedule of items (existing: contract_summary)
  | 'gdot_job_setup'       // Internal job-setup / HeavyBid sheet (existing: job_setup)
  | 'gdot_roadway_log'     // Plan-set roadway log sheet
  | 'ticket_weight_slip'   // Truck ticket / weight slip
  | 'material_cert'        // Asphalt mix design cert, aggregate cert, JMF
  | 'plan_sheet'           // General plan sheet (not a roadway log)
  | 'inspection_report'    // Inspector's daily report / QC form
  | 'unknown';
```

### API Design

New function in `src/lib/server/pdf/classify.ts`:

```ts
export interface DocumentClassification {
  document_class: DocumentClass;
  confidence: 'high' | 'medium' | 'low';
  /** How classification was achieved. */
  method: 'regex' | 'llm' | 'fallback';
}

/**
 * Classify a PDF by its extracted text.
 * Fast-path: attempt regex classification first (zero Neurons, instant).
 * Slow-path: if regex returns 'unknown', call Workers AI with the first
 * ~2 pages of text to get a better classification.
 *
 * The AI call is always best-effort — on error the regex result is returned.
 */
export async function classifyDocument(
  text: string,
  ai: WorkersAi | undefined
): Promise<DocumentClassification>
```

**Regex fast-path** (extend `detectDocumentType` patterns):

| Class | Trigger patterns |
|---|---|
| `gdot_contract` | `Contract Schedule`, `Proposal ID`, `Schedule of Items`, `Total Bid:`, `PROPOSAL INDEX` |
| `gdot_job_setup` | `JOB SET-?UP FORM`, `HEAVYBID #`, `PRODUCTION GOALS` |
| `gdot_roadway_log` | `LOG ROADWAY`, `ROADWAY LOG`, `BEGIN STA`, `END STA.*ELEV` |
| `ticket_weight_slip` | `WEIGHT SLIP`, `LOAD TICKET`, `NET TONS`, `TARE WT`, `GROSS WT` |
| `material_cert` | `MIX DESIGN`, `JMF`, `JOB MIX FORMULA`, `BINDER CONTENT`, `AIR VOIDS` |
| `inspection_report` | `DAILY INSPECTION`, `QC REPORT`, `INSPECTOR:`, `COMPACTION LOG` |

If regex confidence is high (2+ triggers match), skip the AI call entirely.

**AI classification prompt** (only when regex returns `unknown` or 1 weak match):

```
System: You are a document classifier for a highway paving company.
Classify the document excerpt into exactly one of these categories:
gdot_contract, gdot_job_setup, gdot_roadway_log, ticket_weight_slip,
material_cert, plan_sheet, inspection_report, unknown.
Return JSON: { "document_class": "<class>", "confidence": "high|medium|low" }
Return null values only if the text is too short or garbled to classify.

User: <first 3,000 chars of extracted text>
```

Model: `@cf/meta/llama-3.1-8b-instruct-fast` with JSON Mode
(`response_format: { type: 'json_schema', json_schema: classificationSchema() }`)

**Parser router integration** (in `import-pdf/+server.ts`):

```
uploadedFile
  → extractText (pdfjs-serverless, pages 1-2)
  → classifyDocument()            ← NEW (returns immediately, feeds UI)
  → routeToParser(documentClass)  ← NEW (replaces single-path parse-gdot)
      | gdot_contract    → parseGdotDocumentsV2 (existing)
      | gdot_job_setup   → parseGdotDocumentsV2 (existing)
      | gdot_roadway_log → parseGdotDocumentsV2 (existing, roadway-log path)
      | ticket_weight_slip → parseWeightSlip()  ← future
      | material_cert    → parseMaterialCert()  ← future
      | *                → parseGdotDocumentsV2 (best-effort fallback)
  → runLlmFallback() (existing, only for gdot_contract/job_setup)
```

**Response shape addition** (on `POST /api/job-sites/import-pdf`):

```ts
{
  // existing fields...
  classification: {
    document_class: 'gdot_contract',
    confidence: 'high',
    method: 'regex'
  }
}
```

### Neuron cost estimate

~800 Neurons per AI classification call (3,000-char input + 20-token output).
Only called when regex is uncertain. Typical upload session: 1-3 docs.
Budget impact: low (well within 10k/day free tier for normal usage).

---

## Feature 2: Ticket / Weight Slip OCR + Extraction

### Problem

`POST /api/job-sites/:id/loads/scan` currently stores the photo in R2 and returns
`ocr_fields: null` — a stub with a comment saying "Future: integrate Workers AI Vision."
The `TicketCapture.svelte` component has the user manually fill every field after
seeing the image.

### Goal

Extract structured load fields from a ticket photo automatically, pre-filling the
manual form. The user still reviews and confirms before saving; AI output is never
auto-committed.

### Extracted Fields

```ts
export interface TicketOcrFields {
  ticket_number: string | null;
  truck_id: string | null;
  /** Net weight in tons */
  net_tons: number | null;
  /** Raw weight text as printed on the ticket (for verification) */
  weight_raw: string | null;
  material_type: string | null;
  plant_name: string | null;
  /** ISO timestamp string if parseable, else null */
  load_timestamp: string | null;
  /** Confidence on the overall extraction: high/medium/low */
  confidence: 'high' | 'medium' | 'low';
  /** Fields the model was uncertain about */
  low_confidence_fields: string[];
}
```

This maps directly to `loads` table columns:
- `ticket_number` → `loads.ticket_number`
- `net_tons` → `loads.tons`
- `load_timestamp` → `loads.timestamp` (converted to Unix epoch)
- `material_type` → pre-selects mix in the form dropdown

### API Design

Updated `POST /api/job-sites/:id/loads/scan`:

```
1. Accept photo (multipart, field: 'photo')
2. Upload to R2 (existing)
3. Read image bytes back from R2 (or buffer from original upload)
4. Call env.AI.run('@cf/unum/uform-gen2', { image: base64Bytes, prompt: EXTRACTION_PROMPT })
   — fallback model: '@cf/meta/llava-1.5-7b' if uform-gen2 errors
5. Parse response text into TicketOcrFields
6. Return { photo_id, photo, ocr_fields: TicketOcrFields | null }
```

**Model selection:**

| Model | Notes |
|---|---|
| `@cf/unum/uform-gen2` | Preferred — faster, lower Neurons, instruction-following |
| `@cf/meta/llava-1.5-7b` | Fallback — more capable for handwritten text |

Image must be encoded as a base64 string in the `image` field of the input object
(Workers AI image-to-text input shape).

**Extraction prompt:**

```
You are extracting data from a truck weight ticket for a paving job.
From this ticket image, extract:
- ticket_number: the ticket or load number
- truck_id: truck number or ID
- net_tons: net weight in tons (convert from lbs if needed: divide by 2000)
- weight_raw: the weight as printed (e.g. "18.45 TONS" or "36,900 LBS")
- material_type: asphalt mix or material name
- plant_name: asphalt plant or supplier name
- load_timestamp: date and time in ISO 8601 format if present

Return JSON only. Use null for any field not visible or legible.
```

**Parsing weight values:**

Many tickets print in pounds (`36,900 LBS`) or in tons (`18.45 T`). The extraction
function must normalize to tons and retain `weight_raw` for user verification:

```ts
function normalizeWeight(raw: string | null): number | null {
  if (!raw) return null;
  const lbsMatch = /([0-9,]+)\s*(?:lbs?|pounds?)/i.exec(raw);
  if (lbsMatch) return parseFloat(lbsMatch[1].replace(/,/g, '')) / 2000;
  const tonMatch = /([0-9.]+)\s*(?:t(?:ons?)?)/i.exec(raw);
  if (tonMatch) return parseFloat(tonMatch[1]);
  return null;
}
```

**UI integration** (in `TicketCapture.svelte`):

After scan response arrives:
1. Show a "Scanned" badge on fields that were pre-filled by OCR
2. Low-confidence fields get a yellow outline warning users to verify
3. User edits and hits "Log Load" to confirm
4. No AI field is ever written to the DB without user confirmation

**Error handling:**
- AI binding unavailable (local dev) → return `ocr_fields: null`, component
  falls back to fully manual entry (existing behavior)
- Model call errors → same fallback, log the error for observability
- JSON parse failure → same fallback

### Neuron cost estimate

~1,500-3,000 Neurons per image (vision models are significantly heavier than
text models). At 50 loads/day this is 75,000-150,000 Neurons — exceeds free tier.
**Recommendation:** gate behind an org-level feature flag
(`org_settings.ai_ticket_ocr_enabled`) and document the cost. Paid plan orgs opt in
knowingly.

---

## Feature 3: Material Certificate Parsing

### Problem

When contractors upload asphalt mix design certificates (JMFs) or aggregate reports,
there is no parser for them — they fall into `unknown` and produce nothing useful.
This data is valuable: it fills `job_production_mixes` fields that currently require
manual entry (binder content, air voids, VMA, gradation).

### Goal

A new document parser for `material_cert` class documents that extracts mix design
parameters and maps them to existing `job_production_mixes` DB columns plus new
ones to be added.

### Extracted Fields

```ts
export interface ParsedMaterialCert {
  mix_design_number: string | null;
  mix_name: string | null;
  /** e.g. "12.5mm Superpave", "9.5mm Surface" */
  mix_type: string | null;
  /** e.g. "PG 64-22", "PG 76-22" */
  binder_grade: string | null;
  /** % by weight */
  binder_content_pct: number | null;
  /** Voids in the Mineral Aggregate, % */
  vma_pct: number | null;
  /** Air voids at Ndesign, % */
  air_voids_pct: number | null;
  /** Gmm — maximum theoretical specific gravity */
  gmm: number | null;
  /** Gse — effective specific gravity of aggregate */
  gse: number | null;
  /** Target lift thickness, inches (if specified) */
  target_thickness_in: number | null;
  /** Aggregate source / quarry name */
  aggregate_source: string | null;
  /** Lab or testing agency name */
  lab_name: string | null;
  /** Cert issue date */
  issue_date: string | null;
  warnings: string[];
}
```

### New DB Columns (future migration)

The following columns do not yet exist on `job_production_mixes` and would be
added in a separate migration:

```sql
-- Migration 00NN_production_mix_cert_fields.sql
ALTER TABLE job_production_mixes ADD COLUMN binder_grade TEXT;
ALTER TABLE job_production_mixes ADD COLUMN binder_content_pct REAL;
ALTER TABLE job_production_mixes ADD COLUMN vma_pct REAL;
ALTER TABLE job_production_mixes ADD COLUMN air_voids_pct REAL;
ALTER TABLE job_production_mixes ADD COLUMN gmm REAL;
ALTER TABLE job_production_mixes ADD COLUMN cert_source TEXT; -- 'manual' | 'parsed' | 'llm'
```

Existing columns already map cleanly:
- `mix_name` → `mix_name`
- `mix_type` → `mix_type`
- `target_thickness_in` → `target_thickness_in`

### Parse Strategy

Material cert documents are more structured than GDOT contracts. A two-pass
approach:

**Pass 1 — Regex extraction** (zero Neurons):

Mix design certs follow GDOT DM-7 / Superpave format. Known patterns:

```
Mix Design No.:   ___
Binder Content:  5.2%
Air Voids:       3.5%
VMA:             14.2%
Gmm:             2.512
PG Grade:        PG 64-22
```

High-frequency regex patterns cover the common GDOT lab format. Most numeric
fields extract reliably from fixed-position layouts.

**Pass 2 — LLM gap-fill** (only for low-confidence fields):

Same pattern as `llm-fallback.ts`: if regex pass leaves key design parameters
(`binder_content_pct`, `air_voids_pct`, `vma_pct`) low-confidence, send the
relevant text section to Workers AI for extraction. Use the same model
(`@cf/meta/llama-3.1-8b-instruct-fast`) and JSON Mode.

**API surface:**

New route or extended `import-pdf` handling:

```
POST /api/job-sites/:id/import-pdf
  with file classified as 'material_cert'
  → parseMaterialCert(text, ai)
  → response includes:
      {
        document_class: 'material_cert',
        cert: ParsedMaterialCert,
        // suggested mix to update/create:
        suggested_mix_id: string | null,
        confidence_map: Record<keyof ParsedMaterialCert, 'high'|'medium'|'low'>
      }
```

The UI presents a "Review Certificate Data" modal before writing any parsed values
to `job_production_mixes` — same confirm-before-commit pattern as the ticket OCR.

### Neuron cost estimate

~400-800 Neurons per cert document (text model, small focused input).
Low frequency (one cert per mix per job). Negligible budget impact.

---

## Feature 4: Field Assistant (Stretch / Design Only)

### Overview

A natural language interface in the field that lets a foreman ask questions about
the current job site:

- "What's my spread rate target for the surface course?"
- "How many loads have we put down today?"
- "Are we on pace to finish Section 3 by EOD?"

Low priority. No implementation until features 1-3 ship.

### Architecture Sketch

**Retrieval-augmented generation (RAG)** over job data:

```
User question
  → embed question (@cf/baai/bge-base-en-v1.5, 768-dim)
  → retrieve top-K context chunks from job data index
      - job_site_config fields
      - today's loads (aggregated)
      - production_mixes targets vs. actuals
      - daily_log entries
  → generate answer (@cf/meta/llama-3.1-8b-instruct-fast)
      with retrieved context as system context
  → stream response back to UI
```

**Index design:**

Workers AI embeddings are 768-dimensional. For each job site, pre-compute and store
embeddings for:
- "Config chunk" — job name, route, mixes, targets, dates as JSON summary
- "Today's summary" — dynamically built each session from live D1 data

Store in a KV namespace keyed by `{org_id}:{job_site_id}:context` as a JSON array
of `{ text: string, embedding: number[] }` entries. Recompute on any data change
(webhook or on-demand).

**Limitations of Workers AI for RAG:**

- No vector store — Workers AI does not include a managed vector DB. Vectorize
  (Cloudflare's managed product) would be the right pairing but requires a separate
  binding. For a small number of job-site docs, brute-force cosine similarity over
  KV-stored embeddings is viable (< 50 chunks per job site).
- Context window of `llama-3.1-8b-instruct-fast` is 128k tokens — sufficient to
  stuff 5-10 relevant chunks without retrieval for most job queries.
- For the first implementation, skip RAG entirely and just pass the entire job
  context as a structured JSON block in the system prompt. Only introduce embeddings
  if the prompt grows too large.

**API sketch:**

```
POST /api/job-sites/:id/assistant
  body: { question: string, context_snapshot_token?: string }
  response: { answer: string, sources: string[], tokens_used: number }
```

**Neuron cost estimate:**

- Embedding: ~100 Neurons per question
- Text generation: ~500-1,500 Neurons per question
- Total: ~600-1,600 Neurons per question
- Budget concern: if used heavily, can exhaust free tier quickly
- Recommendation: org-level toggle, quota cap (e.g. 20 questions/day/user),
  display a Neuron usage indicator in the UI

---

## Cross-Cutting Concerns

### Binding availability

`env.AI` is typed as `Ai | undefined` in `app.d.ts`. All AI paths must guard:

```ts
if (!event.platform?.env.AI) {
  // degrade gracefully — return null ocr_fields, skip classification, etc.
}
```

Under `vite dev`, the Workers AI binding may be absent (the adapter-cloudflare
platform proxy does not always expose it locally). This is the expected behavior
for local development — tests should pass without AI calls.

### Error handling convention

Follow the pattern established in `llm-fallback.ts`:
1. Wrap all `ai.run()` calls in `try/catch`
2. Return a structured diagnostic (`outcome: 'applied' | 'failed' | 'binding-unavailable'`)
3. Never throw — degrade to the deterministic or manual path
4. Log the failure reason for observability (existing error logging pipeline)

### Neuron budget tracking

Add an optional `x-neurons-used` response header on AI-heavy endpoints so the
admin observability dashboard can track consumption over time. Workers AI run
responses include a `usage` field:

```ts
const result = await ai.run(model, input) as { response: unknown; usage?: { total_tokens: number } };
const neurons = result.usage?.total_tokens ?? 0;
// Include in response headers or log to error/audit pipeline
```

### Testing strategy

AI calls must be mockable. The `WorkersAi` interface in `llm-fallback.ts` is already
the right pattern — pass a mock `WorkersAi` in tests:

```ts
const mockAi: WorkersAi = {
  run: async (model, input) => ({ response: '{"document_class":"gdot_contract","confidence":"high"}' })
};
```

Unit tests cover: classification routing, weight normalization, JSON extraction from
various model response shapes, and the graceful-degradation paths.

### Feature flag schema

Org-level flags to add to `org_settings` (existing JSON column on `orgs` table):

```ts
interface OrgAiSettings {
  /** Feature 1 — always on (low cost, no opt-in needed) */
  ai_document_classification?: boolean;  // default: true
  /** Feature 2 — high Neuron cost, explicit opt-in */
  ai_ticket_ocr?: boolean;               // default: false
  /** Feature 3 — low cost, on by default when billing active */
  ai_material_cert_parsing?: boolean;    // default: true on Paid plan
  /** Feature 4 — stretch, explicit opt-in */
  ai_field_assistant?: boolean;          // default: false
}
```

---

## Implementation Sequence

1. **Classification** (Feature 1) — lowest Neuron cost, highest ROI, integrates into
   the existing `import-pdf` route with minimal schema changes. Deliver a working
   classifier + parser router. Wire classification result into the import-pdf API
   response and the upload UI.

2. **Ticket OCR** (Feature 2) — replace the `ocr_fields: null` stub in `/loads/scan`.
   Gate behind `ai_ticket_ocr` org flag. Update `TicketCapture.svelte` to show
   pre-filled fields with confidence badges.

3. **Material Cert Parsing** (Feature 3) — new parser module + migration for the
   new `job_production_mixes` columns. UI: "Review Certificate Data" confirmation
   modal on import.

4. **Field Assistant** (Feature 4) — design revisit after Features 1-3 ship and
   real Neuron consumption is measured.

---

## Open Questions

1. Should document classification confidence be surfaced to the end user, or only
   used internally to route the parse? (Current leaning: show it in the import
   confirmation modal so the foreman can correct a misclassification.)

2. For ticket OCR, should mismatched `net_tons` (OCR vs. manual) be flagged after
   the fact, or only at entry time? The `load_rejections` table already tracks
   post-hoc rejections.

3. Vectorize binding: is the Cloudflare Vectorize product available on the org's
   current plan? If yes, use it for Feature 4 instead of brute-force KV cosine
   similarity.

4. Rate-limit strategy for the Field Assistant: per-user daily cap, per-org cap,
   or Neuron-budget-based throttle tied to a configurable `ai_daily_neuron_budget`
   org setting?

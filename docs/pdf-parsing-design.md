# PDF Parsing Enhancement Design

**Status:** Draft  
**Scope:** `src/lib/server/pdf/parse-gdot.ts` and related infrastructure  
**Goal:** Evolve from a fragile flat-regex approach to a zone-based, confidence-scored pipeline that degrades gracefully and is ready for an LLM fallback pass.

---

## 1. Audit of Current parse-gdot.ts

### What Works Well

- **Document-type detection** (`detectDocumentType`) — reliable heuristics for `job_setup` vs
  `contract_summary` vs `unknown` using stable sentinel phrases.
- **pdfToText() via pdfjs-serverless** — runs in the Cloudflare Workers runtime without DOM or
  canvas; correctly streams multi-page text.
- **Schedule-of-items extraction** (`parseScheduleOfItems`) — the complex regex that matches
  4-digit line numbers, 3/4-digit item IDs, quantity, unit, unit price, and bid amount handles the
  common GDOT contract format. De-duplicates items that span page breaks.
- **Mix-name normalization** (`mapMixType`) — maps free-text mix names (e.g. "RECYC OGI") to
  canonical Superpave/GDOT types. Conservative — returns null on uncertain cases.
- **Contract-unit-price matching** (`matchMixUnitPrices`) — score-based heuristic links each
  production mix to its bid line-item unit price. Works well for standard GDOT item codes.
- **Scope derivation** (`deriveScopes`) — evidence-backed tags from bid item codes and headline;
  never invents tags without evidence.

### Failure Modes and Fragility Points

| Issue | Root cause | Impact |
|---|---|---|
| No confidence scores | Fields are either extracted or null; caller cannot distinguish "definitely found" from "regex matched noise" | High |
| Flat-text extraction loses layout | `pdfToText` joins all text items with a single space, discarding x/y positions | Breaks table parsing for any non-standard page width |
| Header bleed into item descriptions | Page headers repeat on every PDF page; `cleanItemDescription` is a static allowlist | New GDOT contract templates break it silently |
| Production-goals block requires exact header wording | `PRODUCT TAKEOFF QTY(TN) QUANTITY PER DAY TIME (DAYS)` must match verbatim | One GDOT format revision breaks all mix-goal extraction |
| Bid-quantity block requires exact header | `TYPICAL (GAB,...) UNIT BID QUANTITY` must match | Same brittleness |
| Customer/owner regexes assume a fixed field-adjacency order | e.g. `CUSTOMER\s+(.+?)\s+(?:APPROVED|CUSTOMER ADDRESS)` | Any reordering of form fields produces null or wrong captures |
| County extraction can match false positives | `/([A-Za-z]+)\s+COUNTY\b/i` matches "HENRY COUNTY" anywhere in body text | Returns county from an unrelated sentence |
| No test fixtures | No sample PDFs or golden output snapshots checked in | Regressions are invisible until a user reports bad data |
| No multi-county support | `result.county` is a single string | Projects spanning multiple counties (common in GDOT) silently drop all but first |
| Single-document merge is first-wins | If job_setup is parsed second, fields already set by contract_summary are not overridden | Later document can't correct an earlier bad capture |
| Error budget is binary | Either 0 bid items (warning) or N items (no warning) — no per-field status | Caller cannot tell which half of the form is trustworthy |

---

## 2. Target Architecture

### 2.1 ParsedField<T> — Universal Field Wrapper

Every extracted value should be wrapped in a typed envelope so the UI can render confidence
indicators and the merge logic can make principled decisions.

```typescript
export type FieldConfidence = 'high' | 'medium' | 'low';

/**
 * A single extracted field with provenance.
 *
 * - value: the extracted value, or null if extraction failed.
 * - confidence: how confident the extractor is.
 *   high   — matched a labelled form field or a stable structural marker.
 *   medium — inferred from context (e.g. positional proximity, single candidate).
 *   low    — matched a heuristic pattern with known false-positive risk, or
 *            inferred from an ambiguous source.
 * - source: human-readable description of the extraction method (for debugging
 *   and for the LLM fallback prompt in Phase 2).
 * - raw: the original matched text before normalization (useful for LLM re-check).
 */
export interface ParsedField<T> {
  value: T | null;
  confidence: FieldConfidence;
  source: string;
  raw?: string;
}

// Convenience constructors.
export const field = {
  high:   <T>(value: T, source: string, raw?: string): ParsedField<T> => ({ value, confidence: 'high', source, raw }),
  medium: <T>(value: T, source: string, raw?: string): ParsedField<T> => ({ value, confidence: 'medium', source, raw }),
  low:    <T>(value: T, source: string, raw?: string): ParsedField<T> => ({ value, confidence: 'low', source, raw }),
  missing:<T>(source: string): ParsedField<T> => ({ value: null, confidence: 'low', source }),
};
```

### 2.2 Zone-Based Extraction Pipeline

Instead of one flat-regex pass, we split the document into named zones, then run specialized
parsers per zone. This isolates page-header noise, lets each zone use the most appropriate
matching strategy, and gives the LLM fallback a focused chunk to reason about.

```
pdfToText()              -- existing, keep
     |
     v
detectZones(text)        -- NEW: slice into named regions
     |
     +-- headerZone      -- first ~15 lines (contract id, proposal id, dates)
     +-- tablesZone[]    -- blocks that look like tabular data (repeating delimiters or aligned cols)
     +-- bodyZone        -- narrative text, headline description, notes
     |
     v
parseZone(zone, docType) -- zone-specific parser, returns ParsedField<T> for each field
     |
     v
mergeWithConfidence()    -- confidence-aware merge: higher confidence wins, same confidence -> first
     |
     v
ParsedGdotJobV2          -- enriched result with ParsedField<T> on every field
```

#### Zone Detection Heuristics

A region is classified as **tabular** when two or more consecutive lines each contain 3+ tokens
that are purely numeric or a known unit code (TN, SY, LF, ...), or when lines have 4+ consistent
columnar gaps.

The **header zone** is the first page up to the first blank line after any Contract ID / Proposal
ID / Project No. markers.

The **body zone** is everything not classified as header or table.

### 2.3 Specialized Zone Parsers

#### HeaderZoneParser
- Extracts contract ID, proposal ID, project number, county (only from labelled fields, not body
  text), dates, total bid.
- Uses labelled-field regexes: `ContractID:\s*(\S+)` → `high` confidence.
- Falls back to positional inference (next token after known label) → `medium`.

#### TableZoneParser
- Handles the bid-quantity table, production-goals table, and schedule-of-items table.
- Each table type is detected by its header row.
- Rows are tokenized using column-position inference derived from the header token positions
  (requires position-aware pdfToText — see Phase 1 enhancement below).
- Returns `high` confidence when a row matches all expected columns, `medium` when trailing
  columns are inferred, `low` when only the item ID is certain.

#### BodyZoneParser
- Extracts free-form fields: location description, headline, project manager, asphalt supplier,
  customer info.
- Uses the current adjacency regexes but wraps results in `ParsedField` with appropriate
  confidence:
  - Labelled field immediately followed by value → `high`.
  - Value inferred from proximity to a label, but with >1 word ambiguity → `medium`.
  - Pattern match with known false-positive risk (e.g. bare county match) → `low`.

### 2.4 Confidence-Aware Merge

When two source documents (contract_summary + job_setup) both provide a field:

```
function mergeField<T>(existing: ParsedField<T>, incoming: ParsedField<T>): ParsedField<T> {
  const rank = { high: 2, medium: 1, low: 0 };
  return rank[incoming.confidence] > rank[existing.confidence] ? incoming : existing;
}
```

This replaces the current first-wins pattern and lets a job_setup field override a contract_summary
field when it has higher confidence (e.g. the job setup explicitly labels the PM; the contract
summary only mentions it in passing).

---

## 3. Phase 1 — Immediate Implementation (Zone-Based, No LLM)

### 3.1 Position-Aware pdfToText

Enhance `pdfToText()` to preserve x/y position for each text item:

```typescript
export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

export async function pdfToItems(bytes: ArrayBuffer): Promise<TextItem[]> { ... }

// Legacy helper: flatten to string (preserves existing callers).
export function itemsToText(items: TextItem[]): string { ... }
```

The `pdfjs-serverless` `TextItem` already includes `transform[4]` (x) and `transform[5]` (y) — we
just need to surface them.

With x/y available, the TableZoneParser can:
- Group items into rows by y-band (items within 2px of each other are on the same row).
- Assign items to columns by x-bin derived from the header row's token positions.
- Handle right-aligned numbers reliably (current approach can misparse multi-word descriptions).

### 3.2 Zone Detector

```typescript
export type ZoneType = 'header' | 'table' | 'body';

export interface Zone {
  type: ZoneType;
  label: string;  // e.g. 'schedule_of_items', 'production_goals', 'header_page1'
  items: TextItem[];
  pageRange: [number, number];
}

export function detectZones(items: TextItem[], docType: GdotDocumentType): Zone[] { ... }
```

### 3.3 ParsedGdotJobV2 — Confidence-Annotated Result

```typescript
export interface ParsedGdotJobV2 {
  // Identity
  name:             ParsedField<string>;
  job_number:       ParsedField<string>;
  project_number:   ParsedField<string>;
  contract_id:      ParsedField<string>;
  county:           ParsedField<string>;     // or ParsedField<string[]> for multi-county

  // Contract financials
  contract_amount:  ParsedField<number>;
  retainage_pct:    ParsedField<number>;
  est_start_date:   ParsedField<string>;
  completion_date:  ParsedField<string>;

  // Customer / owner
  customer_name:    ParsedField<string>;
  customer_address: ParsedField<string>;
  customer_contact: ParsedField<string>;
  customer_phone:   ParsedField<string>;
  customer_email:   ParsedField<string>;
  owner_name:       ParsedField<string>;
  owner_address:    ParsedField<string>;

  // Project management
  work_type:        ParsedField<string>;
  contract_type:    ParsedField<string>;
  project_manager:  ParsedField<string>;
  asphalt_supplier: ParsedField<string>;
  location_description: ParsedField<string>;
  total_length_ft:  ParsedField<number>;

  // Derived
  scopes:           string[];               // evidence-backed tags, no confidence needed

  // Line items and mixes (arrays stay flat; confidence is per-item)
  bid_items:        ParsedBidItemV2[];
  production_mixes: ParsedProductionMixV2[];

  // Meta
  detected_documents: GdotDocumentType[];
  has_contract_summary: boolean;
  has_job_setup: boolean;
  warnings: string[];

  // LLM fallback: zones that had low-confidence or null fields (Phase 2 input).
  lowConfidenceZones: Zone[];
}
```

### 3.4 Backward Compatibility Adapter

The existing `ParsedGdotJob` (flat, nullable fields) is used by the import API and job-prefill
logic. Provide a downgrade adapter so callers can adopt V2 incrementally:

```typescript
export function toV1(v2: ParsedGdotJobV2): ParsedGdotJob {
  // Flatten each ParsedField<T> to T | null.
  ...
}
```

The existing `parseGdotDocuments(texts: string[]): ParsedGdotJob` signature stays unchanged;
internally it calls `parseGdotDocumentsV2()` and then `toV1()`.

### 3.5 Error Handling and Warnings

Each zone parser adds a warning when it encounters an expected zone but extracts fewer rows than
expected, e.g.:

```
"schedule_of_items zone detected but 0 rows parsed — possible format variation"
"production_goals header found but no matching rows — check column alignment"
```

Warnings include the zone label and page range so the UI can show a targeted message ("We found
the Schedule of Items on pages 3-8 but couldn't read the rows").

---

## 4. Phase 2 — LLM Fallback Pass (Future)

Phase 2 adds an optional async step after Phase 1 completes. It is invoked only when any scalar
field has `confidence: 'low'` or `value: null` after Phase 1.

### 4.1 Trigger Condition

```typescript
function needsLlmFallback(result: ParsedGdotJobV2): boolean {
  const scalar = ['contract_id', 'county', 'project_number', 'contract_amount', ...] as const;
  return scalar.some(k => result[k].confidence === 'low' || result[k].value === null);
}
```

### 4.2 Prompt Shape

The LLM receives:
1. The raw text of only the `lowConfidenceZones` (not the full PDF text).
2. A structured JSON schema describing what fields to extract (the `ParsedGdotJobV2` shape,
   without arrays — arrays come from Phase 1 only).
3. Explicit instruction: "Return null for any field not found. Do not invent values."

Expected response: a partial `ParsedGdotJobV2`-compatible JSON with confidence annotations.

### 4.3 Merge Strategy

LLM-extracted fields always override Phase 1 fields when Phase 1 confidence was `low`, but never
when Phase 1 confidence was `medium` or `high`. This prevents the LLM from corrupting well-parsed
data while allowing it to fill gaps.

LLM-sourced fields get `confidence: 'medium'` and `source: 'llm-fallback'` regardless of what the
model reports — we never automatically trust the LLM at `high` confidence.

### 4.4 Cloudflare Workers Integration

The LLM fallback uses Cloudflare AI Gateway (Workers AI binding) so it runs in the same Worker
without an external API hop. Model: `@cf/meta/llama-3.1-8b-instruct` or equivalent. This keeps
latency bounded (< 5 s for the zone text) and cost near zero for normal usage.

---

## 5. Test Fixtures Approach

### 5.1 Directory Structure

```
src/lib/server/pdf/__tests__/
  fixtures/
    contract-summary-standard.txt   # pdfToText output of a real GDOT contract summary
    contract-summary-multipage.txt  # one with page-break artifacts
    job-setup-standard.txt          # typical job setup form
    job-setup-missing-goals.txt     # job setup without production goals block
  snapshots/
    contract-summary-standard.json  # golden ParsedGdotJobV2 output
    contract-summary-multipage.json
    job-setup-standard.json
    job-setup-missing-goals.json
  parse-gdot.test.ts                # Vitest unit tests
  zone-detection.test.ts
```

Text fixtures contain only extracted text (not the binary PDF), so they can be committed without
privacy concerns. They are produced by running `pdfToText()` on real GDOT documents and saving the
output.

### 5.2 Snapshot Testing Pattern

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseGdotDocumentsV2 } from '../parse-gdot';

describe('parseGdotDocumentsV2 — contract summary standard', () => {
  const text = readFileSync(`${__dirname}/fixtures/contract-summary-standard.txt`, 'utf-8');
  const result = parseGdotDocumentsV2([text]);

  it('extracts contract_id with high confidence', () => {
    expect(result.contract_id.confidence).toBe('high');
    expect(result.contract_id.value).toMatch(/^[A-Z0-9-]+$/);
  });

  it('parses all bid items', () => {
    expect(result.bid_items.length).toBeGreaterThan(0);
  });

  it('matches golden snapshot', () => {
    expect(result).toMatchSnapshot();
  });
});
```

### 5.3 Adding a New Fixture

1. Run the existing `pdfToText()` on the new PDF (e.g. via a one-off script or the import API
   with debug logging).
2. Save the text output to `fixtures/<name>.txt`.
3. Run `npx vitest run --update-snapshots` to generate the golden JSON.
4. Inspect the golden JSON and verify each field manually before committing.

---

## 6. Migration Plan

| Step | Who | When |
|---|---|---|
| Implement `pdfToItems()` and position-aware `TextItem` | Dev | Sprint 1 |
| Implement `detectZones()` and `ZoneDetector` | Dev | Sprint 1 |
| Rewrite `parseScheduleOfItems` as `TableZoneParser` | Dev | Sprint 1 |
| Add `ParsedField<T>` wrapper and `ParsedGdotJobV2` | Dev | Sprint 1 |
| Rewrite `parseJobSetup` / `parseContractSummary` as zone parsers | Dev | Sprint 2 |
| Implement `mergeWithConfidence()` | Dev | Sprint 2 |
| Add `toV1()` adapter, keep existing public API | Dev | Sprint 2 |
| Create text fixtures for both existing sample PDFs | Dev | Sprint 2 |
| Add snapshot tests for all fixture files | Dev | Sprint 2 |
| LLM fallback integration (Phase 2) | Dev | Sprint 3+ |

---

## 7. Key Decisions and Rationale

**Why zone-based instead of a full positional layout engine?**
pdfjs-serverless already provides the x/y coordinates; we do not need a full rendering engine. Zone
detection based on y-band clustering and header-row recognition covers 95 % of GDOT PDF variants
with < 200 lines of code.

**Why confidence scoring now, even before LLM?**
The UI already shows a "prefill" indicator when PDF data is loaded. Exposing confidence per field
lets us dim low-confidence fields and prompt the user to verify them — this is independently
valuable regardless of Phase 2.

**Why keep the V1 API?**
The import route (`/api/job-sites/import-pdf/+server.ts`) and the GDOT lookup endpoint both
consume `ParsedGdotJob` today. Requiring all callers to migrate at once introduces risk. The adapter
is < 30 lines and can be deleted once all callers are on V2.

**Why text fixtures instead of binary PDF fixtures?**
Committing binary PDFs is impractical (size, privacy, git history bloat). Text fixtures are
human-readable, reviewable in PRs, and sufficient to unit-test the parsing logic. Integration tests
against real PDFs should live in a separate private fixture store (e.g. R2 bucket) and run in CI
only.

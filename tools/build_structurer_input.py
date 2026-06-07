#!/usr/bin/env python3
"""
Reproduce the EXACT model input the PaveRate PDF-import structurer builds, so a
GDOT/LMIG contract PDF can be tested against external LLMs outside the app.

This mirrors, field-for-field, what `src/routes/api/job-sites/import-pdf/+server.ts`
-> `src/lib/server/pdf/structure-contract.ts` send to Workers AI:
  - per-page text extraction + page labeling (labelForPage)
  - evidence assembly with the same caps (7000 chars/page, 60000 total)
  - the verbatim SYSTEM_PROMPT and USER_PROMPT
  - the verbatim STRUCTURED_CONTRACT_SCHEMA (response_format json_schema)
  - the same ai.run params (temperature 0, max_tokens 4096)

NOTE on fidelity: the app extracts text with pdfjs-serverless and groups items
into rows; this script uses pdfplumber (closest layout-aware Python extractor,
falling back to pypdf). Whitespace/line-grouping may differ slightly, but the
page set, labels, caps, prompts, and schema are identical.

Usage:
  python tools/build_structurer_input.py "docs/Jobs/25186/25186 CONTRACT SUMMARY.pdf"
  python tools/build_structurer_input.py <pdf> --out out_dir
  python tools/build_structurer_input.py <pdf> --project-id M006412 --print-route
  python tools/build_structurer_input.py <pdf> --run-bedrock     # optional AWS Bedrock test
  python tools/build_structurer_input.py <pdf> --run-cf          # optional Workers AI test

Outputs (written to --out, default ./structurer-input next to the PDF name):
  <stem>.system.txt      system prompt
  <stem>.user.txt        user prompt (with evidence appended) -- the full user message
  <stem>.evidence.txt    just the assembled evidence block
  <stem>.schema.json     the response_format json_schema
  <stem>.request.json    a ready-to-POST OpenAI-compatible chat request body
  <stem>.gdot.geojson    GDOT Project Hub route geometry when --project-id is used

Optional live runs:
  --run-bedrock needs AWS_BEARER_TOKEN_BEDROCK (+ optional AWS_REGION, BEDROCK_MODEL)
  --run-cf      needs CF_ACCOUNT_ID + CF_API_TOKEN (+ optional CF_MODEL)
"""

from __future__ import annotations

import argparse
import json
import os
import urllib.parse
import urllib.request
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Constants copied VERBATIM from the app.
# evidenceText(pages, 7000, 60000) in structure-contract.ts.
# --------------------------------------------------------------------------

PER_PAGE_CHARS = 7000
TOTAL_CHARS = 60000

# ai.run params from runStructureModel() in structure-contract.ts.
TEMPERATURE = 0
MAX_TOKENS = 4096

# SYSTEM_PROMPT — verbatim from structure-contract.ts.
SYSTEM_PROMPT = (
    "You convert messy Georgia paving contract / plan / roadway-log text into ONE strict JSON object. "
    "You STRUCTURE ONLY: copy values that appear in the text verbatim. NEVER compute, infer, or invent "
    "coordinates, project mileposts, or lengths that the document does not explicitly state. Use null for "
    "anything absent — never guess.\n"
    "A project is N DISCONNECTED segments (separate named roads), not one continuous route. Output one "
    "entry in segments[] per named road to pave.\n"
    "RULES:\n"
    "- A milepost that RESETS to a smaller value (e.g. a ramp restarting at 0.000) begins a NEW segment "
    "with its own measure_axis. Never merge two milepost axes into one segment.\n"
    "- A page header containing \"(CONTINUED)\" is a page break of the SAME section — keep it in the same "
    "segment, do not start a new one.\n"
    "- A single log line that names multiple cross-streets (e.g. \"WOODROW WILSON DR, LT ... GORNTO RD. RT\") "
    "must be EXPLODED into multiple side_roads[] entries at that one measure.\n"
    "- width_change events MUST carry width_ft (e.g. a 48->60->48 transition across turn lanes).\n"
    "- State-route / ramp segments use measure_axis \"project_mile\"; local streets use measure_axis \"none\" "
    "and have no measures.\n"
    "- Group segments by funding program when stated (e.g. LMIG, LRA) in the group field.\n"
    "- Map each segment kind to one of: mainline, ramp, divided, local_street. Map each treatment to one of: "
    "overlay, resurfacing, restripe_only, milling, patching, reconstruction, other.\n"
    "- Keep bid_quantity (contract/allotted tons) separate from takeoff_tonnage (production target tons).\n"
    "- Ignore OCR-garbled typical-section pages; prefer the clean roadway-log table.\n"
    "- midpoint is the plan State Plane mid-point as printed; copy easting/northing/zone_label verbatim and "
    "do NOT reproject. Return null midpoint when none is printed.\n"
    "Return ONLY the JSON object, no prose, no Markdown fences."
)

# userPrompt() preamble — verbatim from structure-contract.ts (evidence appended after).
USER_PROMPT_PREAMBLE = (
    "Structure the following Georgia paving document into the StructuredContract JSON schema. "
    "Produce one segment per named road; explode multi-road lines into side_roads[]; treat milepost "
    "resets as new segments; keep \"(CONTINUED)\" pages in the same segment. "
    "Fill route (null for local-street contracts), county, midpoint (null when absent), gross_length_mi, "
    "segments[], bid_items[], production_mixes[], and warnings[]. Use null for any absent field.\n\n"
    "Document evidence (page-labeled):\n\n"
)

# STRUCTURED_CONTRACT_SCHEMA — verbatim from structured-contract.ts.
NULLABLE_STRING = {"type": ["string", "null"]}
NULLABLE_NUMBER = {"type": ["number", "null"]}

STRUCTURED_CONTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "route": {
            "type": ["object", "null"],
            "properties": {
                "designation": NULLABLE_STRING,
                "kind": NULLABLE_STRING,
                "number": NULLABLE_STRING,
            },
        },
        "county": {
            "type": "object",
            "properties": {"name": NULLABLE_STRING, "fips": NULLABLE_STRING},
        },
        "midpoint": {
            "type": ["object", "null"],
            "properties": {
                "easting": NULLABLE_NUMBER,
                "northing": NULLABLE_NUMBER,
                "zone_label": NULLABLE_STRING,
            },
        },
        "gross_length_mi": NULLABLE_NUMBER,
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": NULLABLE_STRING,
                    "kind": {
                        "type": ["string", "null"],
                        "enum": ["mainline", "ramp", "divided", "local_street", None],
                    },
                    "group": NULLABLE_STRING,
                    "treatment": NULLABLE_STRING,
                    "length_mi": NULLABLE_NUMBER,
                    "begin_terminus": NULLABLE_STRING,
                    "end_terminus": NULLABLE_STRING,
                    "measure_axis": {
                        "type": ["string", "null"],
                        "enum": ["project_mile", "none", None],
                    },
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "type": {
                                    "type": ["string", "null"],
                                    "enum": [
                                        "project_start",
                                        "project_end",
                                        "side_road",
                                        "width_change",
                                        "operation_change",
                                        "reference",
                                        None,
                                    ],
                                },
                                "measure": NULLABLE_NUMBER,
                                "text": NULLABLE_STRING,
                                "width_ft": NULLABLE_NUMBER,
                                "side_roads": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "name": NULLABLE_STRING,
                                            "side": NULLABLE_STRING,
                                        },
                                    },
                                },
                            },
                            "required": ["type", "measure", "text", "width_ft", "side_roads"],
                        },
                    },
                },
                "required": [
                    "name",
                    "kind",
                    "group",
                    "treatment",
                    "length_mi",
                    "begin_terminus",
                    "end_terminus",
                    "measure_axis",
                    "events",
                ],
            },
        },
        "bid_items": {"type": "array", "items": {"type": "object"}},
        "production_mixes": {"type": "array", "items": {"type": "object"}},
        "warnings": {"type": "array", "items": {"type": "string"}},
    },
    "required": [
        "route",
        "county",
        "midpoint",
        "gross_length_mi",
        "segments",
        "bid_items",
        "production_mixes",
        "warnings",
    ],
}


# --------------------------------------------------------------------------
# labelForPage — mirrors labelForPage() in import-pdf/+server.ts.
# --------------------------------------------------------------------------

import re


def label_for_page(text: str, page_number: int) -> str:
    t = text.upper()
    if re.search(r"SCHEDULE OF ITEMS|CONTRACT SCHEDULE|PROPOSAL\s+LINE\s+NUMBER|UNIT PRICE\s+BID AMOUNT", t):
        return "Schedule of Items"
    if re.search(r"DETAILED ESTIMATE", t):
        return "Detailed Estimate"
    if re.search(r"ROADWAY\s+LOG|\bLOG\b.*WIDTH|ROADWAY\s+[\s\S]{0,80}\bLOG\s+WIDTH", t):
        return "Roadway Log"
    if re.search(r"TYPICAL SECTION", t):
        return "Typical Section"
    if re.search(r"GENERAL NOTES", t):
        return "General Notes"
    if re.search(r"EROSION CONTROL", t):
        return "Erosion Control Plan"
    if re.search(r"LOCATION SKETCH", t):
        return "Location Sketch"
    if re.search(r"SPECIAL PROVISION", t):
        return "Special Provision"
    if re.search(r"PROPOSAL INDEX|^\s*INDEX\b|\bINDEX\b\s+\d", t):
        return "Index"
    if re.search(r"COVER SHEET|PLAN OF PROPOSED|DEPARTMENT OF TRANSPORTATION", t) and page_number <= 2:
        return "Cover Sheet"
    if re.search(r"NOTICE TO|BIDDERS|PROPOSAL", t) and page_number <= 2:
        return "Proposal"
    return f"Sheet {page_number}"


# --------------------------------------------------------------------------
# PDF text extraction (pdfplumber preferred; pypdf fallback).
# --------------------------------------------------------------------------


def extract_pages(pdf_path: Path) -> list[str]:
    try:
        import pdfplumber  # type: ignore

        with pdfplumber.open(str(pdf_path)) as pdf:
            return [(page.extract_text() or "") for page in pdf.pages]
    except ImportError:
        pass

    try:
        from pypdf import PdfReader  # type: ignore

        reader = PdfReader(str(pdf_path))
        return [(page.extract_text() or "") for page in reader.pages]
    except ImportError:
        sys.exit(
            "Need a PDF library. Install one:\n"
            "  pip install pdfplumber   (preferred, matches the app's layout grouping best)\n"
            "  pip install pypdf"
        )


# --------------------------------------------------------------------------
# evidenceText — mirrors evidenceText(pages, 7000, 60000) in ai-project-extractor.ts.
# Page block:
#   PDF <index>: <filename>
#   Page <n>: <label>
#   <text[:perPageChars]>
# joined with "\n\n---\n\n", then the whole thing sliced to totalChars.
# --------------------------------------------------------------------------


def build_evidence(
    page_texts: list[str],
    filename: str,
    pdf_index: int = 0,
    per_page_chars: int = PER_PAGE_CHARS,
    total_chars: int = TOTAL_CHARS,
) -> str:
    blocks = []
    for i, text in enumerate(page_texts):
        page_number = i + 1
        label = label_for_page(text, page_number)
        blocks.append(
            "\n".join(
                [
                    f"PDF {pdf_index}: {filename}",
                    f"Page {page_number}: {label}",
                    text[:per_page_chars],
                ]
            )
        )
    evidence = "\n\n---\n\n".join(blocks)
    return evidence[:total_chars]


def build_user_prompt(evidence: str) -> str:
    return USER_PROMPT_PREAMBLE + evidence


def build_request_body(model: str, system_prompt: str, user_prompt: str) -> dict:
    """OpenAI-compatible chat body matching the app's ai.run params."""
    return {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
        "response_format": {
            "type": "json_schema",
            "json_schema": STRUCTURED_CONTRACT_SCHEMA,
        },
    }


def bedrock_system_prompt() -> str:
    """Bedrock Converse has no response_format, so include the schema in prompt text."""
    return (
        SYSTEM_PROMPT
        + "\n\nFor Bedrock, return the raw JSON object only. Do not wrap it in Markdown fences."
        + "\n\nThe JSON object must satisfy this JSON Schema:\n"
        + json.dumps(STRUCTURED_CONTRACT_SCHEMA, separators=(",", ":"))
    )


def fetch_gdot_project_geojson(project_id: str) -> dict:
    url = "https://enterprisegis.dot.ga.gov/hosting/rest/services/GDOT_Public_Outreach/Project_Hub/MapServer/0/query"
    params = {
        "where": f"PROJECT_ID = '{project_id}'",
        "outFields": "*",
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "geojson",
    }
    request_url = f"{url}?{urllib.parse.urlencode(params)}"
    with urllib.request.urlopen(request_url, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def print_gdot_route(geojson: dict) -> None:
    features = geojson.get("features", [])
    print("\nGDOT Project Hub route:")
    print(f"  features: {len(features)}")
    if not features:
        return

    feature = features[0]
    props = feature.get("properties", {})
    geometry = feature.get("geometry") or {}
    coords = geometry.get("coordinates") or []
    print(f"  project_id: {props.get('PROJECT_ID')}")
    print(f"  status: {props.get('STATUS')}")
    print(f"  county: {props.get('COUNTIES')}")
    print(f"  city: {props.get('CITIES')}")
    print(f"  name: {props.get('PROJECT_NAME')}")
    print(f"  work_type: {props.get('PRIMARY_WORK_TYPE')}")
    print(f"  geometry: {geometry.get('type')} ({len(coords)} coordinates)")
    for lon, lat, *extra in coords:
        print(f"    {lon:.8f}, {lat:.8f}")


# --------------------------------------------------------------------------
# Optional live runs (off by default).
# --------------------------------------------------------------------------


def run_bedrock(user_prompt: str) -> str:
    try:
        import boto3  # type: ignore
    except ImportError:
        sys.exit("--run-bedrock needs boto3 installed")

    api_key = os.environ.get("AWS_BEARER_TOKEN_BEDROCK") or os.environ.get("BEDROCK_API_KEY")
    if api_key and "AWS_BEARER_TOKEN_BEDROCK" not in os.environ:
        os.environ["AWS_BEARER_TOKEN_BEDROCK"] = api_key
    if not api_key and not (
        os.environ.get("AWS_ACCESS_KEY_ID") and os.environ.get("AWS_SECRET_ACCESS_KEY")
    ):
        sys.exit("--run-bedrock needs AWS_BEARER_TOKEN_BEDROCK or standard AWS credentials")

    region = (
        os.environ.get("BEDROCK_REGION")
        or os.environ.get("AWS_REGION")
        or os.environ.get("AWS_DEFAULT_REGION")
        or "us-east-1"
    )
    model = os.environ.get("BEDROCK_MODEL", "us.anthropic.claude-sonnet-4-20250514-v1:0")
    max_tokens = int(os.environ.get("BEDROCK_MAX_TOKENS", "8192"))
    client = boto3.client("bedrock-runtime", region_name=region)
    print(
        f"[run-bedrock] converse region={region} model={model} max_tokens={max_tokens} ...",
        file=sys.stderr,
    )
    response = client.converse(
        modelId=model,
        system=[{"text": bedrock_system_prompt()}],
        messages=[{"role": "user", "content": [{"text": user_prompt}]}],
        inferenceConfig={"temperature": TEMPERATURE, "maxTokens": max_tokens},
    )
    text_parts = []
    for block in response.get("output", {}).get("message", {}).get("content", []):
        if "text" in block:
            text_parts.append(block["text"])
    output = "".join(text_parts)
    print(output)
    return output


def run_cf(user_prompt: str) -> None:
    account = os.environ.get("CF_ACCOUNT_ID")
    token = os.environ.get("CF_API_TOKEN")
    if not account or not token:
        sys.exit("--run-cf needs CF_ACCOUNT_ID and CF_API_TOKEN")
    model = os.environ.get("CF_MODEL", "@cf/moonshotai/kimi-k2.5")
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/ai/run/{model}"
    body = {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": TEMPERATURE,
        "max_tokens": MAX_TOKENS,
        "response_format": {"type": "json_schema", "json_schema": STRUCTURED_CONTRACT_SCHEMA},
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    print(f"[run-cf] POST {url} ...", file=sys.stderr)
    with urllib.request.urlopen(req, timeout=180) as resp:
        print(resp.read().decode("utf-8"))


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser(description="Build the exact PaveRate structurer model input from a PDF.")
    ap.add_argument("pdf", help="Path to the contract/plan PDF")
    ap.add_argument("--out", help="Output directory (default: ./structurer-input)")
    ap.add_argument("--per-page-chars", type=int, default=PER_PAGE_CHARS)
    ap.add_argument("--total-chars", type=int, default=TOTAL_CHARS)
    ap.add_argument("--model", default="@cf/moonshotai/kimi-k2.5", help="Model id written into request.json")
    ap.add_argument("--project-id", help="GDOT Project Hub PROJECT_ID / PI number to fetch route geometry")
    ap.add_argument("--print-route", action="store_true", help="Print the fetched GDOT route coordinates")
    ap.add_argument("--run-bedrock", action="store_true", help="Also POST to AWS Bedrock")
    ap.add_argument("--run-cf", action="store_true", help="Also POST to Cloudflare Workers AI")
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        sys.exit(f"PDF not found: {pdf_path}")

    out_dir = Path(args.out) if args.out else Path("structurer-input")
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = pdf_path.stem

    page_texts = extract_pages(pdf_path)
    evidence = build_evidence(
        page_texts,
        filename=pdf_path.name,
        per_page_chars=args.per_page_chars,
        total_chars=args.total_chars,
    )
    user_prompt = build_user_prompt(evidence)
    request_body = build_request_body(args.model, SYSTEM_PROMPT, user_prompt)

    (out_dir / f"{stem}.system.txt").write_text(SYSTEM_PROMPT, encoding="utf-8")
    (out_dir / f"{stem}.user.txt").write_text(user_prompt, encoding="utf-8")
    (out_dir / f"{stem}.evidence.txt").write_text(evidence, encoding="utf-8")
    (out_dir / f"{stem}.schema.json").write_text(
        json.dumps(STRUCTURED_CONTRACT_SCHEMA, indent=2), encoding="utf-8"
    )
    (out_dir / f"{stem}.request.json").write_text(
        json.dumps(request_body, indent=2), encoding="utf-8"
    )

    # Summary (matches the log line fields: pages, text_chars).
    print(f"PDF:            {pdf_path}")
    print(f"pages:          {len(page_texts)}")
    print(f"evidence chars: {len(evidence)} (cap {args.total_chars}, {args.per_page_chars}/page)")
    print(f"user prompt:    {len(user_prompt)} chars")
    print("page labels:")
    for i, text in enumerate(page_texts):
        print(f"  p{i + 1}: {label_for_page(text, i + 1)}")
    print(f"\nWrote to {out_dir}/:")
    for suffix in ("system.txt", "user.txt", "evidence.txt", "schema.json", "request.json"):
        print(f"  {stem}.{suffix}")

    if args.project_id:
        geojson = fetch_gdot_project_geojson(args.project_id)
        (out_dir / f"{stem}.gdot.geojson").write_text(json.dumps(geojson, indent=2), encoding="utf-8")
        print(f"  {stem}.gdot.geojson")
        if args.print_route:
            print_gdot_route(geojson)

    if args.run_bedrock:
        bedrock_output = run_bedrock(user_prompt)
        (out_dir / f"{stem}.bedrock-response.txt").write_text(bedrock_output, encoding="utf-8")
    if args.run_cf:
        run_cf(user_prompt)


if __name__ == "__main__":
    main()

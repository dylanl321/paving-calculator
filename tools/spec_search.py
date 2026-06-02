"""
GDOT spec search + section excerpt tool.

Searches the GDOT PDFs in docs/ for keywords and prints matching pages, so app
values can be validated against the authoritative spec text (see docs/VALIDATION.md).

Usage:
    python tools/spec_search.py "tack coat"
    python tools/spec_search.py "minimum temperature" --pdf std
    python tools/spec_search.py 413 --context 1500
    python tools/spec_search.py --page std 812        # dump a specific page

PDF keys:
    std    -> 2021StandardSpecifications.pdf
    supp   -> 2021Supplemental Specifications 2024 Edition.pdf
    cm     -> cm001.pdf  (Construction Manual)
"""
import argparse
import re
import sys
from pathlib import Path

from pypdf import PdfReader

DOCS = Path(__file__).resolve().parents[1] / "docs"
PDFS = {
    "std": DOCS / "2021StandardSpecifications.pdf",
    "supp": DOCS / "2021Supplemental Specifications 2024 Edition.pdf",
    "cm": DOCS / "cm001.pdf",
}


def iter_pages(keys):
    for key in keys:
        path = PDFS[key]
        reader = PdfReader(str(path))
        for i, page in enumerate(reader.pages):
            yield key, i, (page.extract_text() or "")


def search(term, keys, context):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    pat = re.compile(re.escape(term), re.IGNORECASE)
    hits = 0
    for key, i, text in iter_pages(keys):
        for m in pat.finditer(text):
            hits += 1
            start = max(0, m.start() - context // 2)
            end = min(len(text), m.end() + context // 2)
            snippet = " ".join(text[start:end].split())
            print(f"\n=== [{key}] page {i + 1} (hit {hits}) ===")
            print(snippet)
            break  # one snippet per page keeps output readable
    print(f"\n--- {hits} page(s) matched '{term}' in {','.join(keys)} ---")


def dump_page(key, page_num):
    reader = PdfReader(str(PDFS[key]))
    text = reader.pages[page_num - 1].extract_text() or "<no text>"
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("term", nargs="?", help="search term")
    ap.add_argument("--pdf", choices=list(PDFS) + ["all"], default="all")
    ap.add_argument("--context", type=int, default=600)
    ap.add_argument("--page", nargs=2, metavar=("PDF", "N"),
                    help="dump a specific page, e.g. --page std 812")
    args = ap.parse_args()

    if args.page:
        dump_page(args.page[0], int(args.page[1]))
        return
    if not args.term:
        ap.error("provide a search term or --page")
    keys = list(PDFS) if args.pdf == "all" else [args.pdf]
    search(args.term, keys, args.context)


if __name__ == "__main__":
    main()

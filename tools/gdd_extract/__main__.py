"""`python -m tools.gdd_extract` CLI — extract GDD PDF to JSON.

Usage:
    python -m tools.gdd_extract <game.gdd.pdf> [--out summary.json] [--quiet]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.gdd_extract.extract import extract_gdd


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="gdd-extract",
        description="GDD PDF → semi-structured JSON (W6.1)",
    )
    ap.add_argument("pdf", help="path to GDD PDF")
    ap.add_argument("--out", help="output JSON path (default: stdout)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    pdf_path = Path(args.pdf)
    if not pdf_path.is_file():
        print(f"error: PDF {pdf_path} not found", file=sys.stderr)
        return 2

    data = extract_gdd(pdf_path)
    text = json.dumps(data, indent=2, ensure_ascii=False)
    if args.out:
        Path(args.out).write_text(text)
        if not args.quiet:
            print(f"wrote → {args.out}")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())

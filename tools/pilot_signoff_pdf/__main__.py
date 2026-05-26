"""CLI entry for slot-pilot-signoff-pdf."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.pilot_signoff.report import build_signoff, render_ansi
from tools.pilot_signoff_pdf.pdf import emit_pdf


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-pilot-signoff-pdf",
        description=(
            "Build the W64 sign-off text and emit a real PDF 1.4 "
            "(pure-stdlib, no external library)."
        ),
    )
    p.add_argument("--pilot", type=Path, required=True)
    p.add_argument("--multi-territory", type=Path, default=None)
    p.add_argument("--out", type=Path, required=True,
                   help="output PDF path")
    p.add_argument("--no-deflate", action="store_true",
                   help="skip zlib compression on content streams")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not args.pilot.exists():
        sys.stderr.write(f"pilot dir not found: {args.pilot}\n")
        return 2

    signoff = build_signoff(
        pilot_dir=args.pilot,
        multi_territory_dir=args.multi_territory,
    )
    text = render_ansi(signoff)
    pdf_report = emit_pdf(text, args.out, deflate=not args.no_deflate)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps({
                "signoff": signoff.to_dict(),
                "pdf": pdf_report.to_dict(),
            }, indent=2, sort_keys=True)
        )

    if not args.quiet:
        verdict = "✅ PASS" if signoff.passed else "🔴 FAIL"
        sys.stdout.write(
            f"\n[pilot-signoff-pdf] {verdict}  "
            f"pages={pdf_report.n_pages}  "
            f"size={pdf_report.size_bytes}b  "
            f"sha256={pdf_report.sha256[:16]}…  "
            f"out={args.out}\n"
        )

    return 0 if signoff.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

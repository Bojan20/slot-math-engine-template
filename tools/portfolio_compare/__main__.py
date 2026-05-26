"""CLI entry for slot-portfolio-compare."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.portfolio_compare.comparator import compare, render_markdown


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-portfolio-compare",
        description=(
            "Summarize a portfolio of IRs into a side-by-side table."
        ),
    )
    p.add_argument("irs", nargs="+", type=Path)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--md", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    parsed: list[dict] = []
    for p_ir in args.irs:
        try:
            parsed.append(json.loads(p_ir.read_text()))
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read {p_ir}: {e}\n")
            return 2

    report = compare(parsed)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(render_markdown(report))

    if not args.quiet:
        sys.stdout.write(
            f"\n[portfolio-compare] {report.n_games} games  "
            f"vendors={report.vendor_breakdown}  "
            f"RTP={report.rtp_range}\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

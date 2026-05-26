"""W57 — slot-operator-dashboard CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.operator_dashboard.aggregator import aggregate, emit_dashboard


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-operator-dashboard",
        description="Aggregate per-game signals into one HTML + JSON "
                    "dashboard with green/yellow/red verdicts.",
    )
    p.add_argument("games_root", help="directory holding *.ir.json files")
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--glob", default="*.ir.json")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = aggregate(Path(args.games_root), glob=args.glob)
    paths = emit_dashboard(report, Path(args.out))
    if not args.quiet:
        sys.stdout.write(json.dumps(
            {"counts": report.counts,
             "html": str(paths["html"]),
             "json": str(paths["json"])},
            indent=2,
        ) + "\n")
    # Exit 1 if any red, else 0
    return 1 if report.counts.get("red", 0) > 0 else 0


if __name__ == "__main__":
    sys.exit(main())

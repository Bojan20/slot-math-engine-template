"""CLI entry for slot-pilot-signoff."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.pilot_signoff.report import build_signoff, render_ansi


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-pilot-signoff",
        description=(
            "Aggregate W59 onboard + W51 cert + W53 jurisdiction "
            "artifacts into a regulator-ready ANSI sign-off page."
        ),
    )
    p.add_argument("--pilot", type=Path, required=True,
                   help="pilot_<vendor_id>/ directory from W59")
    p.add_argument("--multi-territory", type=Path, default=None,
                   help="multi-territory output dir from W53 (optional)")
    p.add_argument("--out", type=Path, required=True,
                   help="path to write the ANSI sign-off text")
    p.add_argument("--json", type=Path, default=None,
                   help="optional structured JSON dump")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not args.pilot.exists():
        sys.stderr.write(f"pilot dir not found: {args.pilot}\n")
        return 2

    report = build_signoff(
        pilot_dir=args.pilot,
        multi_territory_dir=args.multi_territory,
    )

    ansi = render_ansi(report)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(ansi)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ PASS" if report.passed else "🔴 FAIL"
        sys.stdout.write(
            f"\n[pilot-signoff] {verdict}  game={report.game_id}  "
            f"juris={report.n_jurisdictions} (failing={report.n_failing_jurisdictions})  "
            f"out={args.out}\n"
        )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

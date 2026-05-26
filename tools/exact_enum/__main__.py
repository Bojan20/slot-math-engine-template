"""CLI entry for slot-exact-enum."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.exact_enum.engine import (
    ExactEnumerationLimitExceeded,
    combination_count,
    enumerate_exact,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-exact-enum",
        description=(
            "Exhaustive enumeration of every reel-combination → "
            "EXACT RTP, variance, max-win, hit-freq, and pay histogram."
        ),
    )
    p.add_argument("ir", type=Path)
    p.add_argument("--max-combinations", type=int, default=50_000_000)
    p.add_argument("--histogram-top-n", type=int, default=32)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--count-only", action="store_true",
                   help="print combination count and exit (no enumeration)")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir = json.loads(args.ir.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    if args.count_only:
        n = combination_count(ir)
        sys.stdout.write(f"{n}\n")
        return 0

    try:
        report = enumerate_exact(
            ir,
            max_combinations=args.max_combinations,
            histogram_top_n=args.histogram_top_n,
        )
    except ExactEnumerationLimitExceeded as e:
        sys.stderr.write(f"limit exceeded: {e}\n")
        return 2
    except ValueError as e:
        sys.stderr.write(f"invalid IR: {e}\n")
        return 2

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"\n[exact-enum] combos={report.combinations:,}  "
            f"exact_rtp={report.exact_rtp:.10f}  "
            f"exact_variance={report.exact_variance:.6g}  "
            f"max_pay={report.max_pay}  "
            f"hit_freq={report.hit_freq:.6f}  "
            f"paytable_rows={report.paytable_rows_evaluated}\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

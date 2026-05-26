"""CLI entry for slot-volatility-classify."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.volatility_classifier.classifier import (
    VolTier,
    classify,
    classify_from_samples,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-volatility-classify",
        description=(
            "Classify a game into LOW/MEDIUM/HIGH/EXTREME volatility from "
            "session statistics (CV = stddev/mean)."
        ),
    )
    p.add_argument("--mean", type=float, default=None,
                   help="mean per-spin pay")
    p.add_argument("--stddev", type=float, default=None,
                   help="stddev per-spin pay")
    p.add_argument("--samples", type=Path, default=None,
                   help="text file with one pay per line")
    p.add_argument("--expected-tier", default=None,
                   help="exit 1 unless detected tier matches")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if args.samples:
        if not args.samples.exists():
            sys.stderr.write(f"samples not found: {args.samples}\n")
            return 2
        pays = []
        for line in args.samples.read_text().splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                pays.append(float(line))
            except ValueError:
                continue
        report = classify_from_samples(pays)
    elif args.mean is not None and args.stddev is not None:
        report = classify(mean_pay=args.mean, stddev_pay=args.stddev)
    else:
        sys.stderr.write("must pass --samples OR --mean + --stddev\n")
        return 2

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(report.to_dict(), indent=2, sort_keys=True)
        )

    if not args.quiet:
        sys.stdout.write(
            f"\n[vol-classify] tier={report.tier.value.upper()}  "
            f"CV={report.cv:.3f}  mean={report.mean_pay:.4f}  "
            f"stddev={report.stddev_pay:.4f}  n={report.sample_size}\n"
        )
        sys.stdout.write(f"  rationale: {report.rationale}\n")

    if args.expected_tier:
        expected = VolTier(args.expected_tier.lower())
        if report.tier != expected:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""CLI entry for slot-feature-coverage."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.feature_coverage.auditor import audit_irs


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-feature-coverage",
        description=(
            "Audit which IR features have closed-form kernel coverage."
        ),
    )
    p.add_argument("irs", nargs="+", type=Path)
    p.add_argument("--min-coverage", type=float, default=0.5,
                   help="exit 1 if coverage pct falls below this")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    parsed: list[dict] = []
    for ir_p in args.irs:
        try:
            parsed.append(json.loads(ir_p.read_text()))
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read {ir_p}: {e}\n")
            return 2

    report = audit_irs(parsed)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"\n[feature-coverage] {report.n_irs} IRs  "
            f"coverage={report.coverage_pct*100:.1f}%  "
            f"uncovered={len(report.uncovered_features)}  "
            f"unused_kernels={len(report.unused_kernels)}\n"
        )
        if report.uncovered_features:
            sys.stdout.write("  ↳ uncovered features:\n")
            for k in report.uncovered_features:
                sys.stdout.write(f"    🔴 {k}\n")
        for vendor, pct in sorted(report.per_vendor_coverage.items()):
            sys.stdout.write(f"  {vendor:14s}  {pct*100:5.1f}%\n")

    return 0 if report.coverage_pct >= args.min_coverage else 1


if __name__ == "__main__":
    raise SystemExit(main())

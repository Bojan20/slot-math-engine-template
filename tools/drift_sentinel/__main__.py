"""CLI entry for slot-drift-sentinel.

Example:
    slot-drift-sentinel games/ --update --json reports/drift.json \\
        --markdown reports/drift.md

Exit codes:
    0  — no red drift, no errors
    1  — at least one IR is red-severity drift or NEW (CI block)
    2  — at least one IR could not be parsed (configuration error)
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.drift_sentinel.sentinel import (
    DriftClass,
    DriftSeverity,
    scan_directory,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-drift-sentinel",
        description=(
            "Single-invocation drift sentinel for game IRs. Computes a "
            "structural fingerprint + Bernoulli RTP estimate per IR, "
            "compares to a persisted baseline, emits a drift report."
        ),
    )
    p.add_argument("games_root", type=Path,
                   help="root directory to scan (recursively)")
    p.add_argument("--baseline", type=Path, default=None,
                   help=("path to baseline JSON "
                         "(default: <games_root>/.drift-baselines.json)"))
    p.add_argument("--update", action="store_true",
                   help="rewrite baseline to reflect this scan "
                        "(NEW seeded, DRIFTED updated, REMOVED dropped)")
    p.add_argument("--json", type=Path, default=None,
                   help="write JSON report to this path")
    p.add_argument("--markdown", type=Path, default=None,
                   help="write Markdown report to this path")
    p.add_argument("--glob", action="append", default=None,
                   help="repeatable; override default IR globs "
                        "(*.ir.json, ir.json, universal_ir.json)")
    p.add_argument("--quiet", action="store_true",
                   help="suppress stdout summary table")
    args = p.parse_args(argv)

    report = scan_directory(
        args.games_root,
        baseline_path=args.baseline,
        update_baseline=args.update,
        globs=args.glob,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2,
                                        sort_keys=True))
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(report.to_markdown())

    if not args.quiet:
        sys.stdout.write(
            f"\n[drift-sentinel] {len(report.entries)} IR(s) scanned · "
            f"unchanged={report.counts.get(DriftClass.UNCHANGED.value, 0)} "
            f"new={report.counts.get(DriftClass.NEW.value, 0)} "
            f"drifted={report.counts.get(DriftClass.DRIFTED.value, 0)} "
            f"removed={report.counts.get(DriftClass.REMOVED.value, 0)} "
            f"error={report.counts.get(DriftClass.ERROR.value, 0)} "
            f"| severity green={report.severity_counts.get(DriftSeverity.GREEN.value, 0)} "
            f"yellow={report.severity_counts.get(DriftSeverity.YELLOW.value, 0)} "
            f"red={report.severity_counts.get(DriftSeverity.RED.value, 0)}\n"
        )
        for e in report.entries:
            tag = e.severity.value if e.status.value == "drifted" else e.status.value
            line = f"  {tag:10s} {e.rel_path}"
            if e.delta_abs is not None and e.status.value == "drifted":
                line += f"  Δ={e.delta_abs:.4f}"
            if e.error:
                line += f"  ({e.error})"
            sys.stdout.write(line + "\n")

    if report.has_error:
        return 2
    # New IRs without --update are flagged; with --update they're now
    # baselined so they're not blocking.
    has_new_unbaselined = (
        any(e.status == DriftClass.NEW for e in report.entries)
        and not args.update
    )
    if report.has_red or has_new_unbaselined:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

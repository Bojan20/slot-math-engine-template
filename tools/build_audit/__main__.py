"""PHASE 44 — `slot-build-audit` CLI.

Runs all three audit agents (Build Button + Weight Precision + Math
Algorithm) and emits a single regulator-friendly report.

Usage:
    python -m tools.build_audit run [--repo-root PATH] [--out PATH]
                                     [--format md|json|both]
                                     [--strict]

Exit codes:
    0  PASS or WARN
    1  FAIL (set --strict to also fail on WARN)
    2  usage error
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.build_audit.harness import run_full_audit


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="slot-build-audit")
    sub = p.add_subparsers(dest="cmd", required=True)

    rp = sub.add_parser("run", help="run the full Build audit")
    rp.add_argument("--repo-root", default=".", help="repo root (defaults to cwd)")
    rp.add_argument("--out", default="reports/build_audit/", help="output dir")
    rp.add_argument(
        "--format", choices=["md", "json", "both"], default="both",
    )
    rp.add_argument(
        "--strict",
        action="store_true",
        help="exit 1 also on WARN (default: only FAIL trips exit 1)",
    )
    rp.add_argument("--quiet", action="store_true")

    args = p.parse_args(argv)
    if args.cmd != "run":
        return 2

    report = run_full_audit(args.repo_root, out_dir=args.out)
    body_md = report.to_markdown()
    if not args.quiet and args.format in ("md", "both"):
        sys.stdout.write(body_md)
    if not args.quiet and args.format == "json":
        sys.stdout.write(json.dumps(report.to_dict(), indent=2) + "\n")

    overall = report.summary.get("overall_verdict", "FAIL")
    if overall == "FAIL":
        return 1
    if args.strict and overall == "WARN":
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

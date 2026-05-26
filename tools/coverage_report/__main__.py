"""W25 CLI — `slot-coverage <repo-root> --out <dir>`."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tools.coverage_report import aggregate_coverage, emit_coverage


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-coverage",
        description="W25 — emit a repo-wide coverage report (solver "
                    "kernels + jurisdictions + vendors + scripts + tests).",
    )
    ap.add_argument("repo_root", nargs="?", default=".",
                    help="path to repo root (default: cwd)")
    ap.add_argument("--out", required=True,
                    help="output dir for coverage.json + coverage.md")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)
    root = Path(args.repo_root)
    if not root.is_dir():
        print(f"error: {root} is not a directory", file=sys.stderr)
        return 2
    cov = aggregate_coverage(root)
    paths = emit_coverage(cov, Path(args.out))
    if not args.quiet:
        for kind, p in paths.items():
            print(f"wrote {kind:5s} → {p}")
        print(f"  kernels: {len(cov.solver_kernels)}")
        print(f"  jurisdictions: {len(cov.jurisdiction_profiles)}")
        print(f"  vendors: {len(cov.vendor_profiles)}")
        print(f"  scripts: {len(cov.console_scripts)}")
        print(f"  tests: ~{cov.test_count_estimated}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

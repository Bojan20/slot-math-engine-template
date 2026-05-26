"""CLI entry for slot-catalog-sync."""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

from tools.catalog_sync.syncer import build_catalog


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-catalog-sync",
        description=(
            "Build a SemVer-tagged downloadable index over every "
            "closed-form solver kernel."
        ),
    )
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--bump", choices=["patch", "minor", "major"],
                   default="patch")
    p.add_argument("--no-docstrings", action="store_true")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = build_catalog(
        args.out,
        bump=args.bump,
        include_docstrings=not args.no_docstrings,
    )
    if not args.quiet:
        sys.stdout.write(
            f"\n[catalog-sync] version={report.version}  "
            f"kernels={report.n_kernels}  "
            f"with_ana={report.n_with_analytical}  "
            f"with_mc={report.n_with_mc}  out={args.out}\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

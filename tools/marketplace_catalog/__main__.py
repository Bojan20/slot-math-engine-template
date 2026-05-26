"""W75 / P7.1 — slot-marketplace-catalog CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.marketplace_catalog.builder import build_catalog, emit_catalog


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-marketplace-catalog",
        description="Walk a games root and emit a marketplace-ready "
                    "catalog (marketplace.json + .md + per-template "
                    "card files) with pricing tiers + lead-gen blurbs.",
    )
    p.add_argument("games_root", help="directory containing IR files")
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--demo-base-url", default="",
                   help="base URL used to build per-template demo links")
    p.add_argument("--cover-dir", default="covers/",
                   help="rel path used for cover image references")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    cat = build_catalog(
        Path(args.games_root),
        demo_base_url=args.demo_base_url,
        cover_dir=args.cover_dir,
    )
    paths = emit_catalog(cat, Path(args.out))
    if args.json:
        sys.stdout.write(json.dumps(cat.to_dict(), indent=2) + "\n")
    else:
        sys.stdout.write(
            f"[marketplace-catalog] {cat.counts.get('total', 0)} "
            f"templates · free={cat.counts.get('free', 0)} "
            f"basic={cat.counts.get('basic', 0)} "
            f"premium={cat.counts.get('premium', 0)}\n"
        )
        for k, v in paths.items():
            sys.stdout.write(f"  {k}: {v}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())

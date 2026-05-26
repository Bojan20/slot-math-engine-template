"""W24 CLI — `slot-audit-trail <game-dir> --out <dir>`."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from tools.audit_trail.aggregator import aggregate_game_trail, emit_trail


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-audit-trail",
        description="W24 — aggregate every audit-trail artifact for a "
                    "game directory into a chronological timeline.",
    )
    ap.add_argument("game_dir", help="path to games/<id>/ directory")
    ap.add_argument("--out", required=True,
                    help="output dir for audit_trail.json + .md")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    game_dir = Path(args.game_dir)
    if not game_dir.is_dir():
        print(f"error: {game_dir} is not a directory", file=sys.stderr)
        return 2

    trail = aggregate_game_trail(game_dir)
    paths = emit_trail(trail, Path(args.out))
    if not args.quiet:
        for kind, path in paths.items():
            print(f"wrote {kind:5s} → {path}")
        print(f"  entries: {len(trail.entries)}")
        print(f"  sources: {', '.join(trail.sources_scanned) or '—'}")
        if trail.warnings:
            print(f"  warnings: {len(trail.warnings)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

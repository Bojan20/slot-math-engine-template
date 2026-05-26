"""W22 CLI — `slot-ir-migrate <ir.json> [--target N] [--out PATH]`."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.ir_schema.migrate import (
    CURRENT_SCHEMA_VERSION,
    detect_version,
    list_migrations,
    migrate,
)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-ir-migrate",
        description="W22 — forward-migrate an IR JSON to the latest "
                    "schema version. Idempotent on current IRs.",
    )
    ap.add_argument("ir", nargs="?", help="path to IR JSON")
    ap.add_argument("--target", type=int, default=CURRENT_SCHEMA_VERSION,
                    help=f"target schema version (default: latest "
                         f"= {CURRENT_SCHEMA_VERSION})")
    ap.add_argument("--out", help="output path (default: in-place)")
    ap.add_argument("--detect", action="store_true",
                    help="just print detected version + chain, no write")
    ap.add_argument("--list", action="store_true",
                    help="list registered migrations and exit")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if args.list:
        print(f"current schema version: {CURRENT_SCHEMA_VERSION}")
        print("migrations:")
        for a, b in list_migrations():
            print(f"  v{a} → v{b}")
        return 0

    if not args.ir:
        ap.error("ir argument is required (unless --list)")

    ir_path = Path(args.ir)
    if not ir_path.is_file():
        print(f"error: {ir_path} not found", file=sys.stderr)
        return 2
    ir = json.loads(ir_path.read_text())
    detected = detect_version(ir)

    if args.detect:
        print(f"detected: v{detected}")
        print(f"latest:   v{CURRENT_SCHEMA_VERSION}")
        steps = max(0, args.target - detected)
        print(f"migrations to apply: {steps}")
        return 0

    if detected > args.target:
        print(f"error: detected v{detected} > target v{args.target}; "
              "downgrade unsupported", file=sys.stderr)
        return 2

    migrated = migrate(ir, args.target)
    out_path = Path(args.out) if args.out else ir_path
    out_path.write_text(json.dumps(migrated, indent=2, ensure_ascii=False))
    if not args.quiet:
        print(f"migrated v{detected} → v{args.target} → {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

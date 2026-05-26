"""CLI entry for slot-ir-sanitize."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.ir_sanitizer.sanitizer import sanitize_ir


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-ir-sanitize",
        description="Redact vendor identifiers from an IR for public sharing.",
    )
    p.add_argument("ir", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--block-regex", default=None,
                   help="redact any string matching this regex")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir = json.loads(args.ir.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    sanitized, report = sanitize_ir(ir, block_regex=args.block_regex)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(sanitized, indent=2, sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"\n[ir-sanitize] redactions={report.n_redactions}  out={args.out}\n"
        )
        for r in report.redactions:
            sys.stdout.write(f"  • {r}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

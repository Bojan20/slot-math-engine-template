"""CLI entry for slot-regulator-export."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.regulator_export.exporter import export_game


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-regulator-export",
        description="Bundle a regulator-ready submission (IR + math doc + manifest).",
    )
    p.add_argument("--ir", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--math-doc", type=Path, default=None)
    p.add_argument("--truth-check", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir = json.loads(args.ir.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    doc_text = args.math_doc.read_text() if args.math_doc else None
    truth = None
    if args.truth_check:
        try:
            truth = json.loads(args.truth_check.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read truth check: {e}\n")
            return 2

    manifest = export_game(
        ir, out_dir=args.out, math_doc_text=doc_text, truth_check=truth,
    )
    if not args.quiet:
        sys.stdout.write(
            f"\n[regulator-export] {manifest.game_id} ({manifest.vendor})  "
            f"entries={len(manifest.entries)}  out={args.out}\n"
        )
        for e in manifest.entries:
            sys.stdout.write(f"  • {e.rel_path}  {e.sha256[:12]}…  {e.size_bytes}b\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""CLI entry for slot-ir-diff-heatmap."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.ir_diff_heatmap.differ import diff_irs, render_markdown


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-ir-diff-heatmap",
        description=(
            "Structural diff of 2 IRs with per-field impact classification."
        ),
    )
    p.add_argument("ir_a", type=Path)
    p.add_argument("ir_b", type=Path)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--md", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        a = json.loads(args.ir_a.read_text())
        b = json.loads(args.ir_b.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IRs: {e}\n")
        return 2

    report = diff_irs(a, b)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(report.to_dict(), indent=2, sort_keys=True)
        )
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(render_markdown(report))

    if not args.quiet:
        sys.stdout.write(
            f"\n[ir-diff-heatmap] {len(report.changes)} changes  "
            f"🔴{report.n_high}  🟡{report.n_medium}  ⚪{report.n_low}  "
            f"score={report.aggregate_score}\n"
        )
    return 0 if report.n_high == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

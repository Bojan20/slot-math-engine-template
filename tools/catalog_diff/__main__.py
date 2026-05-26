"""CLI entry for slot-catalog-diff."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.catalog_diff.differ import diff_indices, render_markdown


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-catalog-diff",
        description="Compare two catalog INDEX.json snapshots.",
    )
    p.add_argument("--old", type=Path, required=True,
                   help="old INDEX.json from W61 catalog_sync")
    p.add_argument("--new", type=Path, required=True,
                   help="new INDEX.json from W61 catalog_sync")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--md", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        old_idx = json.loads(args.old.read_text())
        new_idx = json.loads(args.new.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read INDEX json: {e}\n")
        return 2

    report = diff_indices(old_idx, new_idx)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(render_markdown(report))

    if not args.quiet:
        verdict = "✅ COMPATIBLE" if report.passed else "🔴 BREAKING"
        sys.stdout.write(
            f"\n[catalog-diff] {verdict}  "
            f"old={report.old_version}  new={report.new_version}  "
            f"+{len(report.added)} -{len(report.removed)}  "
            f"deltas={len(report.deltas)}  breaking={report.n_breaking}\n"
        )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

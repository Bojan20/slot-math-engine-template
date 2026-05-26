"""CLI entry for slot-sbom-diff."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.sbom_diff.differ import diff_sboms, render_markdown


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-sbom-diff",
        description="Compare two W67 CycloneDX SBOM snapshots.",
    )
    p.add_argument("--old", type=Path, required=True)
    p.add_argument("--new", type=Path, required=True)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--md", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        old_doc = json.loads(args.old.read_text())
        new_doc = json.loads(args.new.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read SBOM: {e}\n")
        return 2

    report = diff_sboms(old_doc, new_doc)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(report.to_dict(), indent=2, sort_keys=True)
        )
    if args.md:
        args.md.parent.mkdir(parents=True, exist_ok=True)
        args.md.write_text(render_markdown(report))

    if not args.quiet:
        verdict = "✅ COMPATIBLE" if report.passed else "🔴 BREAKING"
        sys.stdout.write(
            f"\n[sbom-diff] {verdict}  +{len(report.added)} -{len(report.removed)}  "
            f"deltas={len(report.deltas)}  "
            f"ep:+{len(report.entry_points_added)}/-{len(report.entry_points_removed)}  "
            f"breaking={report.n_breaking}\n"
        )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

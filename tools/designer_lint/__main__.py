"""CLI entry for slot-designer-lint."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.designer_lint.linter import lint_ir


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-designer-lint",
        description="Catch common IR design mistakes before MC.",
    )
    p.add_argument("ir", type=Path)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--strict", action="store_true",
                   help="treat warnings as errors")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir = json.loads(args.ir.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    report = lint_ir(ir)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ PASS" if report.passed else "🔴 FAIL"
        sys.stdout.write(
            f"\n[designer-lint] {verdict}  "
            f"errors={report.n_errors}  warnings={report.n_warnings}\n"
        )
        for issue in report.issues:
            tag = "🔴" if issue.severity == "error" else "🟡"
            sys.stdout.write(f"  {tag} [{issue.rule}] {issue.message}\n")

    if args.strict and report.n_warnings:
        return 1
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

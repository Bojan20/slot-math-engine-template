"""CLI entry for slot-spec-compliance."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.spec_compliance.gate import run_gate


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-spec-compliance",
        description=(
            "Cross-check math doc ↔ IR ↔ closed-form kernel RTP. "
            "Exit 1 on any error issue."
        ),
    )
    p.add_argument("--ir", type=Path, required=True)
    p.add_argument("--doc", type=Path, required=True)
    p.add_argument("--kernel-rtp", type=float, default=None,
                   help="closed-form analytical RTP to cross-check")
    p.add_argument("--rtp-tolerance", type=float, default=0.0001)
    p.add_argument("--kernel-tolerance", type=float, default=0.05)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = run_gate(
        ir_path=args.ir, doc_path=args.doc,
        rtp_tolerance=args.rtp_tolerance,
        kernel_rtp=args.kernel_rtp,
        kernel_tolerance=args.kernel_tolerance,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(report.to_dict(), indent=2, sort_keys=True)
        )

    if not args.quiet:
        verdict = "✅ PASS" if report.passed else "🔴 FAIL"
        sys.stdout.write(
            f"\n[spec-compliance] {verdict}  "
            f"doc_rows={report.n_doc_rows}  ir_rows={report.n_ir_rows}  "
            f"issues={len(report.issues)}\n"
        )
        for issue in report.issues:
            tag = "🟡" if issue.severity == "warning" else "🔴"
            sys.stdout.write(
                f"  {tag} [{issue.category}] {issue.message}\n"
            )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())

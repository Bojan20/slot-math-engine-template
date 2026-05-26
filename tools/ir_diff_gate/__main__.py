"""W58 — slot-ir-diff-gate CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.ir_diff_gate.gate import GateConfig, run_gate


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-ir-diff-gate",
        description="CI gate over a two-IR diff with configurable rules.",
    )
    p.add_argument("a", help="path to baseline IR JSON (A)")
    p.add_argument("b", help="path to HEAD IR JSON (B)")
    p.add_argument("--max-rtp-delta", type=float, default=0.005)
    p.add_argument("--max-paytable-changes", type=int, default=0)
    p.add_argument("--allow-feature-additions", action="store_true")
    p.add_argument("--allow-feature-removals", action="store_true")
    p.add_argument("--disallow-meta-drift", action="store_true",
                   help="default: meta drift allowed; set this to fail "
                        "on any meta field changes")
    p.add_argument("--allow-topology-change", action="store_true")
    p.add_argument("--json", action="store_true")
    p.add_argument("--out", help="write the report JSON to this path")
    args = p.parse_args(argv)

    cfg = GateConfig(
        max_rtp_delta=args.max_rtp_delta,
        max_paytable_changes=args.max_paytable_changes,
        allow_feature_additions=args.allow_feature_additions,
        allow_feature_removals=args.allow_feature_removals,
        allow_meta_drift=(not args.disallow_meta_drift),
        allow_topology_change=args.allow_topology_change,
    )
    report = run_gate(Path(args.a), Path(args.b), config=cfg)
    payload = report.to_dict()
    if args.out:
        Path(args.out).write_text(json.dumps(payload, indent=2))
    if args.json:
        sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    else:
        sys.stdout.write(
            f"[ir-diff-gate] {report.verdict.value.upper()} "
            f"(exit {report.exit_code()}) "
            f"findings={len(report.findings)}\n"
        )
        for f in report.findings:
            sys.stdout.write(f"  - {f.severity.value} · {f.rule}: {f.detail}\n")
    return report.exit_code()


if __name__ == "__main__":
    sys.exit(main())

"""CLI entry for slot-smt-multi."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.smt_multi.solver import (
    ConstraintSpec,
    synthesize_paytable_scale,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-smt-multi",
        description=(
            "Multi-constraint SMT-style IR synthesizer: scale paytable "
            "to satisfy RTP + variance + max-win + hit-freq simultaneously."
        ),
    )
    p.add_argument("ir", type=Path)
    p.add_argument("--target-rtp", type=float, required=True)
    p.add_argument("--rtp-eps", type=float, default=1e-4)
    p.add_argument("--var-max", type=float, default=None)
    p.add_argument("--win-max", type=float, default=None)
    p.add_argument("--hit-freq-min", type=float, default=None)
    p.add_argument("--apply-out", type=Path, default=None,
                   help="emit a scaled IR JSON when SAT")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir = json.loads(args.ir.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    spec = ConstraintSpec(
        target_rtp=args.target_rtp,
        rtp_epsilon=args.rtp_eps,
        var_max=args.var_max,
        win_max=args.win_max,
        hit_freq_min=args.hit_freq_min,
    )
    result = synthesize_paytable_scale(ir, spec)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True))

    if args.apply_out and result.sat and result.scale_k is not None:
        scaled = json.loads(json.dumps(ir))   # deep-copy
        for row in scaled.get("paytable") or []:
            if isinstance(row, dict) and isinstance(row.get("pays"), (int, float)):
                row["pays"] = round(row["pays"] * result.scale_k, 6)
        args.apply_out.parent.mkdir(parents=True, exist_ok=True)
        args.apply_out.write_text(json.dumps(scaled, indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ SAT" if result.sat else "🔴 UNSAT"
        sys.stdout.write(
            f"\n[smt-multi] {verdict}  k={result.scale_k}  "
            f"rtp={result.achieved_rtp}  var={result.achieved_variance}  "
            f"max_win={result.achieved_max_win}  hit_freq={result.hit_freq}\n"
        )
        if result.reason:
            sys.stdout.write(f"  reason: {result.reason}\n")

    return 0 if result.sat else 1


if __name__ == "__main__":
    raise SystemExit(main())

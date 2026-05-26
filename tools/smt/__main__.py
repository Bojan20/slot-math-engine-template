"""`python -m tools.smt` CLI — closed-form RTP synthesis via Z3 SMT.

Usage:
    python -m tools.smt <IR.json> --target-rtp 0.96 [--mode scale|per-symbol]
                        [--symbols Red7 Blue7 ...] [--out new_ir.json]
                        [--timeout-ms N] [--verbose]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.smt.rtp_synthesizer import (
    RtpSynthesisError,
    apply_paytable_scale,
    apply_per_symbol_pays,
    closed_form_line_rtp,
    synth_paytable_scale,
    synth_per_symbol_pays,
)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="smt-rtp-synth",
        description="Z3 closed-form RTP synthesis (W7.3)",
    )
    ap.add_argument("ir", help="path to slot-sim IR JSON")
    ap.add_argument("--target-rtp", type=float, required=True,
                    help="target RTP (e.g. 0.96)")
    ap.add_argument("--mode", choices=("scale", "per-symbol"),
                    default="scale",
                    help="scale: single multiplicative scale; "
                         "per-symbol: solve per-symbol pays "
                         "(requires --symbols)")
    ap.add_argument("--symbols", nargs="+",
                    help="symbols to solve in per-symbol mode")
    ap.add_argument("--pay-min", type=float, default=1.0)
    ap.add_argument("--pay-max", type=float, default=10_000.0)
    ap.add_argument("--out",
                    help="write new IR with solved pays (default: stdout summary)")
    ap.add_argument("--timeout-ms", type=int, default=30_000)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)

    ir_path = Path(args.ir)
    if not ir_path.is_file():
        print(f"error: IR file {ir_path} not found", file=sys.stderr)
        return 2

    with open(ir_path) as f:
        ir = json.load(f)

    baseline = closed_form_line_rtp(ir)
    if args.verbose:
        print(f"baseline line RTP (closed form): {baseline:.6f}")
        print(f"target RTP:                      {args.target_rtp:.6f}")

    try:
        if args.mode == "scale":
            scale = synth_paytable_scale(
                ir,
                target_rtp=args.target_rtp,
                timeout_ms=args.timeout_ms,
            )
            new_ir = apply_paytable_scale(ir, scale)
            new_rtp = closed_form_line_rtp(new_ir)
            print(f"solved scale: {scale:.8f}")
            print(f"new line RTP: {new_rtp:.6f}  (target {args.target_rtp:.6f})")
            if args.out:
                with open(args.out, "w") as f:
                    json.dump(new_ir, f, indent=2)
                print(f"wrote new IR → {args.out}")
        else:
            if not args.symbols:
                print("error: --mode per-symbol requires --symbols",
                      file=sys.stderr)
                return 2
            pays = synth_per_symbol_pays(
                ir,
                target_rtp=args.target_rtp,
                symbols=args.symbols,
                pay_min=args.pay_min,
                pay_max=args.pay_max,
                timeout_ms=args.timeout_ms,
            )
            new_ir = apply_per_symbol_pays(ir, pays)
            new_rtp = closed_form_line_rtp(new_ir)
            print("solved pays:")
            for (sym, count), p in sorted(pays.items()):
                print(f"  {sym} × {count}: {p:.4f}")
            print(f"new line RTP: {new_rtp:.6f}  (target {args.target_rtp:.6f})")
            if args.out:
                with open(args.out, "w") as f:
                    json.dump(new_ir, f, indent=2)
                print(f"wrote new IR → {args.out}")
    except RtpSynthesisError as e:
        print(f"SMT failure: {e}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

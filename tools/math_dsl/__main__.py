"""CLI entry point: `python -m tools.math_dsl <command> <spec.yaml> [opts]`.

Commands
========

  parse SPEC          → JSON-dump the parsed MathDslSpec (validation only)
  compile SPEC        → SlotGameIR skeleton (uniform weights, monotone pays)
  synth SPEC [--mode] → SlotGameIR with Z3-solved reel weights

Default mode is `C-1` (uniform HP/LP/special); pass `--mode c-3` to use
the hit-freq-constrained solver.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path

from .spec import parse_spec, DslParseError
from .compile import compile_to_ir, CompileError


def _dump_spec(spec) -> str:
    def encode(o):
        if dataclasses.is_dataclass(o):
            return dataclasses.asdict(o)
        return o.__dict__ if hasattr(o, "__dict__") else str(o)
    return json.dumps(spec, default=encode, indent=2, sort_keys=False)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser("tools.math_dsl")
    sub = p.add_subparsers(dest="cmd", required=True)

    pp = sub.add_parser("parse", help="Parse + validate, dump spec JSON")
    pp.add_argument("spec", type=Path)

    pc = sub.add_parser("compile", help="Compile to SlotGameIR skeleton")
    pc.add_argument("spec", type=Path)
    pc.add_argument("--indent", type=int, default=2)

    ps = sub.add_parser("synth", help="Compile + Z3-solve reel weights")
    ps.add_argument("spec", type=Path)
    ps.add_argument("--mode", choices=["c-1", "c-3"], default="c-1")
    ps.add_argument("--indent", type=int, default=2)
    ps.add_argument("--timeout-ms", type=int, default=60_000)

    args = p.parse_args(argv)
    text = args.spec.read_text(encoding="utf-8")
    try:
        spec = parse_spec(text)
    except DslParseError as e:
        print(f"DSL parse error: {e}", file=sys.stderr)
        return 2

    if args.cmd == "parse":
        sys.stdout.write(_dump_spec(spec))
        return 0

    try:
        ir = compile_to_ir(spec)
    except CompileError as e:
        print(f"DSL compile error: {e}", file=sys.stderr)
        return 3

    if args.cmd == "compile":
        sys.stdout.write(json.dumps(ir, indent=args.indent, sort_keys=False))
        return 0

    # synth
    from tools.smt.weight_synthesizer import (
        synth_uniform_weights,
        synth_with_hit_freq,
        RtpSynthesisError,
        measured_rtp,
    )
    try:
        if args.mode == "c-1":
            ir2 = synth_uniform_weights(
                ir, spec.constraints.target_rtp,
                reel_length=float(spec.hints.get("reel_length") or 60),
                tolerance=spec.constraints.rtp_tolerance,
                timeout_ms=args.timeout_ms,
            )
        else:
            ir2 = synth_with_hit_freq(
                ir, spec.constraints.target_rtp, spec.constraints.hit_freq_target,
                reel_length=float(spec.hints.get("reel_length") or 60),
                tolerance=spec.constraints.rtp_tolerance,
                timeout_ms=args.timeout_ms,
            )
        measured = measured_rtp(ir2)
        ir2.setdefault("_synth_log", {}).update({"measured_rtp_post": measured})
    except RtpSynthesisError as e:
        print(f"Z3 synthesis failed: {e}", file=sys.stderr)
        return 4

    sys.stdout.write(json.dumps(ir2, indent=args.indent, sort_keys=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

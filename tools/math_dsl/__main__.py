"""CLI entry point: `python -m tools.math_dsl <command> <spec.yaml> [opts]`.

Commands
========

  parse SPEC                 → JSON-dump the parsed MathDslSpec (validation only)
  compile SPEC               → SlotGameIR skeleton (uniform weights, monotone pays)
  synth SPEC [--mode]        → SlotGameIR with Z3-solved reel weights
                                (c-1 uniform, c-3 hit_freq, c-4 volatility)
  extract IR_JSON            → DSL YAML reconstructed from a SlotGameIR JSON
  roundtrip SPEC             → DSL → IR → DSL YAML (refactor / normalization)

Default synth mode is `C-1` (uniform HP/LP/special); pass `--mode c-3`
for hit-freq constraint or `--mode c-4` for volatility CV bucket.
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import sys
from pathlib import Path

from .spec import parse_spec, DslParseError
from .compile import compile_to_ir, CompileError
from .extract import extract_from_ir, serialize_to_yaml, ExtractError


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
    ps.add_argument("--mode", choices=["c-1", "c-3", "c-4"], default="c-1")
    ps.add_argument("--indent", type=int, default=2)
    ps.add_argument("--timeout-ms", type=int, default=120_000)

    pe = sub.add_parser("extract", help="IR JSON → reconstructed DSL YAML")
    pe.add_argument("ir_json", type=Path)

    pr = sub.add_parser("roundtrip", help="DSL → IR → DSL (refactor)")
    pr.add_argument("spec", type=Path)

    pm = sub.add_parser("mutate", help="Apply natural-language mutation to a DSL spec")
    pm.add_argument("spec", type=Path)
    pm.add_argument("prompt", type=str, help='e.g. "raise RTP to 97; set volatility to high"')
    pm.add_argument("--show-log", action="store_true")

    args = p.parse_args(argv)

    # Branches that don't take a DSL spec
    if args.cmd == "extract":
        ir = json.loads(args.ir_json.read_text(encoding="utf-8"))
        try:
            spec = extract_from_ir(ir)
        except ExtractError as e:
            print(f"extract error: {e}", file=sys.stderr)
            return 5
        sys.stdout.write(serialize_to_yaml(spec))
        return 0
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

    if args.cmd == "roundtrip":
        recovered = extract_from_ir(ir)
        sys.stdout.write(serialize_to_yaml(recovered))
        return 0

    if args.cmd == "mutate":
        from .mutate import apply_mutation
        mutated, log = apply_mutation(spec, args.prompt)
        if args.show_log:
            sys.stderr.write(f"# Mutation log: {log.applied_count} applied, {len(log.errors)} errors\n")
            for o in log.ops:
                sys.stderr.write(f"#   [{'✓' if o.applied else '✗'}] {o.description}\n")
            for e in log.errors:
                sys.stderr.write(f"#   ERR: {e}\n")
        sys.stdout.write(serialize_to_yaml(mutated))
        return 0

    # synth
    from tools.smt.weight_synthesizer import (
        synth_uniform_weights,
        synth_with_hit_freq,
        synth_with_volatility,
        RtpSynthesisError,
        measured_rtp,
        coefficient_of_variation,
    )
    try:
        if args.mode == "c-1":
            ir2 = synth_uniform_weights(
                ir, spec.constraints.target_rtp,
                reel_length=float(spec.hints.get("reel_length") or 60),
                tolerance=spec.constraints.rtp_tolerance,
                timeout_ms=args.timeout_ms,
            )
        elif args.mode == "c-3":
            ir2 = synth_with_hit_freq(
                ir, spec.constraints.target_rtp, spec.constraints.hit_freq_target,
                reel_length=float(spec.hints.get("reel_length") or 60),
                tolerance=spec.constraints.rtp_tolerance,
                timeout_ms=args.timeout_ms,
            )
        else:  # c-4
            ir2 = synth_with_volatility(
                ir, spec.constraints.target_rtp, spec.constraints.volatility_class,
                reel_length=float(spec.hints.get("reel_length") or 60),
                tolerance=spec.constraints.rtp_tolerance,
                timeout_ms=args.timeout_ms,
            )
        measured = measured_rtp(ir2)
        cv = coefficient_of_variation(ir2)
        ir2.setdefault("_synth_log", {}).update({
            "measured_rtp_post": measured,
            "cv_post": cv,
        })
    except RtpSynthesisError as e:
        print(f"Z3 synthesis failed: {e}", file=sys.stderr)
        return 4

    sys.stdout.write(json.dumps(ir2, indent=args.indent, sort_keys=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

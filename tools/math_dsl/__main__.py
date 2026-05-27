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

    pd = sub.add_parser("diff", help="Semantic diff between two DSL spec YAMLs")
    pd.add_argument("a", type=Path)
    pd.add_argument("b", type=Path)

    pcert = sub.add_parser("cert", help="Build a cert bundle ZIP from a DSL spec (synthesizes via Z3 first)")
    pcert.add_argument("spec", type=Path)
    pcert.add_argument("--out-dir", type=Path, default=Path("./out/cert"))
    pcert.add_argument("--mode", choices=["c-1", "c-3", "c-4", "c-5"], default="c-1")
    pcert.add_argument("--notes", type=str, default=None)

    psign = sub.add_parser("sign", help="Sign an IR JSON in-place (injects provenance block)")
    psign.add_argument("ir_json", type=Path)
    psign.add_argument("--vendor", type=str, required=True)
    psign.add_argument("--par-source", type=str, default="dsl-synth")
    psign.add_argument("--swid", type=str, default=None)
    psign.add_argument("--build-hash", type=str, default=None)
    psign.add_argument("--algo", choices=["auto", "hmac", "ed25519"], default="auto")

    pverify = sub.add_parser("verify", help="Verify an IR JSON's provenance block")
    pverify.add_argument("ir_json", type=Path)
    pverify.add_argument("--public-pem", type=Path, default=None)

    paccept = sub.add_parser("acceptance", help="Run acceptance suite over a specs directory")
    paccept.add_argument("specs_dir", type=Path)
    paccept.add_argument("--mode", choices=["c-1", "c-3", "c-4", "c-5"], default="c-1")
    paccept.add_argument("--out-json", type=Path, default=None)

    ppipe = sub.add_parser("pipeline", help="One-shot DSL → solved → signed → cert ZIP")
    ppipe.add_argument("spec", type=Path)
    ppipe.add_argument("--out-dir", type=Path, default=Path("./out/cert"))
    ppipe.add_argument("--mode", choices=["c-1", "c-3", "c-4", "c-5"], default="c-1")
    ppipe.add_argument("--vendor", type=str, default="studio-internal")
    ppipe.add_argument("--swid", type=str, default=None)
    ppipe.add_argument("--build-hash", type=str, default=None)
    ppipe.add_argument("--notes", type=str, default=None)
    ppipe.add_argument("--algo", choices=["auto", "hmac", "ed25519"], default="auto")

    paudit = sub.add_parser("audit-verify", help="Verify SHA-256 chain of an audit log JSONL")
    paudit.add_argument("audit_path", type=Path)

    plint = sub.add_parser("lint", help="Static lint of a DSL spec (rule LINT001..LINT015)")
    plint.add_argument("spec", type=Path)
    plint.add_argument("--include-info", action="store_true")

    pdocs = sub.add_parser("docs", help="Render full markdown design doc from spec")
    pdocs.add_argument("spec", type=Path)

    pmcv = sub.add_parser("mc-validate", help="Run N-spin MC against solved IR JSON; compare to closed-form RTP")
    pmcv.add_argument("ir_json", type=Path)
    pmcv.add_argument("--spins", type=int, default=100_000)
    pmcv.add_argument("--seed", type=int, default=0xC0DE_F00D)

    phealth = sub.add_parser("health", help="Combined lint + compile + dry-run Z3 synth check")
    phealth.add_argument("spec", type=Path)
    phealth.add_argument("--no-synth", action="store_true")

    pstress = sub.add_parser("stress", help="Try Mode C-4 against every volatility class for a spec")
    pstress.add_argument("spec", type=Path)

    pprompt = sub.add_parser("prompt", help="Natural-language prompt → fresh DSL YAML")
    pprompt.add_argument("text", type=str, help='e.g. "5x3 lines, RTP 96, free spins, 20 paylines"')

    args = p.parse_args(argv)

    # diff and cert have their own loading logic
    if args.cmd == "diff":
        a_spec = parse_spec(args.a.read_text(encoding="utf-8"))
        b_spec = parse_spec(args.b.read_text(encoding="utf-8"))
        from .diff import diff_specs, render_diff
        entries = diff_specs(a_spec, b_spec)
        sys.stdout.write(render_diff(entries))
        return 0

    if args.cmd == "sign":
        from .provenance import sign_and_inject_provenance
        ir = json.loads(args.ir_json.read_text(encoding="utf-8"))
        signed = sign_and_inject_provenance(
            ir, vendor=args.vendor, par_source=args.par_source,
            swid=args.swid, build_hash=args.build_hash, algo=args.algo,
        )
        args.ir_json.write_text(
            json.dumps(signed, indent=2, sort_keys=False), encoding="utf-8"
        )
        sys.stderr.write(f"signed in place: {args.ir_json}\n")
        return 0

    if args.cmd == "verify":
        from .provenance import verify_provenance
        ir = json.loads(args.ir_json.read_text(encoding="utf-8"))
        pem = args.public_pem.read_text(encoding="utf-8") if args.public_pem else None
        ok, reason = verify_provenance(ir, public_pem=pem)
        sys.stdout.write(f"{'OK' if ok else 'FAIL'} — {reason}\n")
        return 0 if ok else 1

    if args.cmd == "acceptance":
        from .acceptance import run_acceptance
        report = run_acceptance(args.specs_dir, mode=args.mode)
        sys.stdout.write(report.summary())
        if args.out_json:
            import dataclasses
            args.out_json.write_text(
                json.dumps(
                    {"ok": report.ok,
                     "pass": report.pass_count,
                     "fail": report.fail_count,
                     "entries": [dataclasses.asdict(e) for e in report.entries]},
                    indent=2, sort_keys=False,
                ),
                encoding="utf-8",
            )
        return 0 if report.ok else 1

    if args.cmd == "pipeline":
        from .pipeline import run_pipeline, PipelineError
        try:
            res = run_pipeline(
                args.spec, args.out_dir,
                mode=args.mode, vendor=args.vendor, swid=args.swid,
                build_hash=args.build_hash, notes=args.notes, algo=args.algo,
            )
        except PipelineError as e:
            print(f"pipeline failed: {e}", file=sys.stderr)
            return 6
        sys.stdout.write(json.dumps(res, indent=2, sort_keys=False) + "\n")
        return 0

    if args.cmd == "audit-verify":
        from .audit import verify_audit_chain
        ok, bad = verify_audit_chain(args.audit_path)
        if ok:
            sys.stdout.write(f"OK — audit chain valid ({args.audit_path})\n")
            return 0
        sys.stdout.write(f"FAIL — broken at line(s) {bad}\n")
        return 1

    if args.cmd == "lint":
        from .lint import lint_spec, render_lint
        try:
            lint_spec_obj = parse_spec(args.spec.read_text(encoding="utf-8"))
        except DslParseError as e:
            print(f"DSL parse error: {e}", file=sys.stderr)
            return 2
        findings = lint_spec(lint_spec_obj)
        if not args.include_info:
            findings = [f for f in findings if f.severity != "info"]
        sys.stdout.write(render_lint(findings))
        return 1 if any(f.severity == "error" for f in findings) else 0

    if args.cmd == "docs":
        from .docs import render_docs
        try:
            docs_spec_obj = parse_spec(args.spec.read_text(encoding="utf-8"))
        except DslParseError as e:
            print(f"DSL parse error: {e}", file=sys.stderr)
            return 2
        sys.stdout.write(render_docs(docs_spec_obj))
        return 0

    if args.cmd == "mc-validate":
        from .mc_validate import mc_validate
        ir = json.loads(args.ir_json.read_text(encoding="utf-8"))
        report = mc_validate(ir, spins=args.spins, seed=args.seed)
        sys.stdout.write(report.summary())
        return 0 if report.verdict == "PASS" else 1

    if args.cmd == "health":
        from .health import health_check
        try:
            health_spec = parse_spec(args.spec.read_text(encoding="utf-8"))
        except DslParseError as e:
            print(f"DSL parse error: {e}", file=sys.stderr)
            return 2
        report = health_check(health_spec, dry_run_synth=not args.no_synth)
        sys.stdout.write(report.summary())
        return 0 if report.ok else 1

    if args.cmd == "stress":
        from .stress import stress_synth
        try:
            stress_spec = parse_spec(args.spec.read_text(encoding="utf-8"))
        except DslParseError as e:
            print(f"DSL parse error: {e}", file=sys.stderr)
            return 2
        report = stress_synth(stress_spec)
        sys.stdout.write(report.summary())
        return 0

    if args.cmd == "prompt":
        from .prompt import parse_prompt
        new_spec, log = parse_prompt(args.text)
        sys.stderr.write(f"# Prompt parsed: {len(log.ops)} ops, {len(log.errors)} errors\n")
        for op in log.ops:
            sys.stderr.write(f"#   [✓] {op.kind}: {op.description}\n")
        sys.stdout.write(serialize_to_yaml(new_spec))
        return 0

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

    if args.cmd == "cert":
        from tools.smt.weight_synthesizer import (
            synth_uniform_weights, synth_with_hit_freq,
            synth_with_volatility, synth_multi_objective,
            RtpSynthesisError,
        )
        from .cert_bundle import build_cert_bundle
        try:
            if args.mode == "c-1":
                solved = synth_uniform_weights(
                    ir, spec.constraints.target_rtp,
                    reel_length=float(spec.hints.get("reel_length") or 60),
                    tolerance=spec.constraints.rtp_tolerance,
                )
            elif args.mode == "c-3":
                solved = synth_with_hit_freq(
                    ir, spec.constraints.target_rtp, spec.constraints.hit_freq_target,
                    reel_length=float(spec.hints.get("reel_length") or 60),
                    tolerance=spec.constraints.rtp_tolerance,
                )
            elif args.mode == "c-4":
                solved = synth_with_volatility(
                    ir, spec.constraints.target_rtp, spec.constraints.volatility_class,
                    reel_length=float(spec.hints.get("reel_length") or 60),
                    tolerance=spec.constraints.rtp_tolerance,
                )
            else:  # c-5
                solved = synth_multi_objective(
                    ir, target_rtp=spec.constraints.target_rtp,
                    target_hit_freq=spec.constraints.hit_freq_target,
                    volatility_class=spec.constraints.volatility_class,
                    reel_length=float(spec.hints.get("reel_length") or 60),
                    rtp_tolerance=spec.constraints.rtp_tolerance,
                )
        except RtpSynthesisError as e:
            print(f"Z3 synthesis failed: {e}", file=sys.stderr)
            return 4
        zip_path = build_cert_bundle(spec, solved, args.out_dir, notes=args.notes)
        sys.stdout.write(str(zip_path) + "\n")
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

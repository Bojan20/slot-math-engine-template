"""SLOT-MATH unified CLI — `slot-math` binary entry point.

Wires Faza 1-6 commands into one cohesive interface:

  slot-math par add <game> --variant <id>=<path>
  slot-math par list
  slot-math par info <game> <variant>
  slot-math par remove <game> <variant>
  slot-math ir build <game> <variant>
  slot-math mc run <game> <variant> --tier T1..T5
  slot-math deploy <game> <variant> [--skin <dir>]
  slot-math build <game> --variant <id> [--mc-tier T3]
  slot-math build <game> --all-variants
  slot-math compare <game> --variants a,b,c,d
  slot-math promote <game> --variant <id> [--tag GA-YYYY-Qn]
  slot-math audit <game> <variant>
  slot-math attestation <game> <variant>
  slot-math critique <par-path>
  slot-math canary status <game>
  slot-math zk verify <attestation-path>

Pure-stdlib argparse — no Click/Typer dependency.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parent.parent


def _cmd_par(args: argparse.Namespace) -> int:
    """Delegate to existing tools.par_library_cli implementations."""
    # Reuse the existing par_library_cli adapter
    from tools.par_library_cli import (
        cmd_add,
        cmd_info,
        cmd_list,
        cmd_remove,
    )

    if args.par_action == "add":
        # par add <game> --variant <id>=<path> [--vendor name]
        for v in args.variant:
            if "=" not in v:
                print(f"error: --variant must be id=path, got {v!r}", file=sys.stderr)
                return 2
            vid, vpath = v.split("=", 1)
            print(f"[par add] {args.game} variant={vid} from {vpath}")
            cmd_add(args.game, vid, vpath, vendor=args.vendor)
        return 0
    if args.par_action == "list":
        cmd_list()
        return 0
    if args.par_action == "info":
        cmd_info(args.game, args.variant)
        return 0
    if args.par_action == "remove":
        cmd_remove(args.game, args.variant)
        return 0
    return 2


def _cmd_ir(args: argparse.Namespace) -> int:
    """Build Game IR from canonical PAR for given variant."""
    import yaml

    from tools.par_to_ir import (
        attach_kernel_composition,
        bind_rng_profile,
        map_par_to_ir,
        validate_ir,
    )
    from tools.par_to_ir.map import attach_ir_merkle

    par_path = REPO / "reports" / "par-library" / args.game / args.variant / "canonical.par.yaml"
    if not par_path.exists():
        print(f"error: PAR not found: {par_path}", file=sys.stderr)
        return 2

    par = yaml.safe_load(par_path.read_text())
    ir = map_par_to_ir(par)
    validate_ir(ir)
    attach_kernel_composition(ir)
    bind_rng_profile(ir)
    attach_ir_merkle(ir)

    out_dir = REPO / "build" / "games" / args.game / args.variant
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "game.ir.json"
    out_path.write_text(json.dumps(ir, sort_keys=True, indent=2) + "\n")
    print(f"[ir build] {args.game}/{args.variant} → {out_path}")
    print(f"  ir_merkle: {ir['provenance']['ir_sha256'][:16]}...")
    print(f"  rng: {ir['rng']['kind']}")
    print(f"  kernels: {len(ir.get('kernel_composition', []))}")
    return 0


def _cmd_mc(args: argparse.Namespace) -> int:
    """Run MC convergence sweep for variant."""
    import yaml

    from tools.par_mc_convergence import Tier
    from tools.par_mc_convergence.orchestrator import run_sweep, write_sweep_artefacts

    par_path = REPO / "reports" / "par-library" / args.game / args.variant / "canonical.par.yaml"
    ir_path = REPO / "build" / "games" / args.game / args.variant / "game.ir.json"

    if not par_path.exists():
        print(f"error: PAR not found: {par_path}", file=sys.stderr)
        return 2
    if not ir_path.exists():
        print("error: IR not built — run `slot-math ir build` first", file=sys.stderr)
        return 2

    par = yaml.safe_load(par_path.read_text())
    ir = json.loads(ir_path.read_text())
    tier = Tier(args.tier.upper() if args.tier.startswith("T") else f"T{args.tier}")

    print(f"[mc run] {args.game}/{args.variant} tier={tier.value}")
    sweep = run_sweep(ir, par, tier)
    out_dir = REPO / "build" / "games" / args.game / args.variant
    paths = write_sweep_artefacts(sweep, out_dir)
    status = "✅ PASS" if sweep.overall_pass else "🔴 FAIL"
    print(f"  {status} measured RTP={sweep.measured.rtp:.6f}")
    print(f"  wallclock: {sweep.wallclock_seconds:.2f}s")
    for kind, path in paths.items():
        print(f"  {kind}: {path}")
    return 0 if sweep.overall_pass else 1


def _cmd_deploy(args: argparse.Namespace) -> int:
    """Build web + RGS deploy bundle from IR."""
    from tools.par_deploy import (
        build_deploy_attestation,
        copy_skin_assets,
        emit_rgs_bundle,
        emit_web_bundle,
        write_attestation_chain,
    )

    ir_path = REPO / "build" / "games" / args.game / args.variant / "game.ir.json"
    if not ir_path.exists():
        print("error: IR not built", file=sys.stderr)
        return 2
    ir = json.loads(ir_path.read_text())
    out_dir = REPO / "build" / "games" / args.game / args.variant

    print(f"[deploy] {args.game}/{args.variant}")
    web = emit_web_bundle(ir, out_dir)
    emit_rgs_bundle(ir, out_dir)
    skin_dir = Path(args.skin) if args.skin else None
    copy_skin_assets(skin_dir, out_dir, ir)

    att = build_deploy_attestation(
        game_id=args.game,
        variant_id=args.variant,
        par_merkle=ir.get("provenance", {}).get("par_sha256", ""),
        ir_merkle=ir.get("provenance", {}).get("ir_sha256", ""),
        mc_sweep_merkle="<not-yet-run>",
        bundle_merkle=web["bundle_sha256"],
        kernel_merkle="<W244>",
        jurisdiction_codes=ir.get("compliance", {}).get("jurisdictions", []),
    )
    chain = write_attestation_chain(att, out_dir)
    print(f"  web: {web['out_dir']}")
    print(f"  attestation: {chain['attestation_dir']}")
    print(f"  deploy_signature: {chain['deploy_signature_sha256'][:16]}...")
    return 0


def _cmd_critique(args: argparse.Namespace) -> int:
    """Run PAR critique heuristic on canonical PAR."""
    import yaml

    from tools.par_critique import critique_par

    par_path = Path(args.par_path)
    if not par_path.exists():
        print(f"error: file not found: {par_path}", file=sys.stderr)
        return 2
    par = yaml.safe_load(par_path.read_text())
    findings = critique_par(par)
    if not findings:
        print(f"[critique] {par_path.name}: ✅ no findings")
        return 0
    print(f"[critique] {par_path.name}: {len(findings)} findings")
    for f in findings:
        sym = {"error": "🔴", "warning": "🟡", "info": "ℹ️"}.get(f.severity.value, "·")
        print(f"  {sym} {f.rule_id} {f.severity.value.upper()}: {f.message}")
    return 0 if all(f.severity.value != "error" for f in findings) else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="slot-math",
        description="SLOT-MATH engine CLI — PAR → playable game pipeline",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    # par
    par = sub.add_parser("par", help="PAR library management")
    par_sub = par.add_subparsers(dest="par_action", required=True)
    p_add = par_sub.add_parser("add", help="Add variant to library")
    p_add.add_argument("game")
    p_add.add_argument("--variant", action="append", required=True, help="id=path")
    p_add.add_argument("--vendor", default="generic")
    par_sub.add_parser("list", help="List PAR library variants")
    p_info = par_sub.add_parser("info", help="Show variant details")
    p_info.add_argument("game")
    p_info.add_argument("variant")
    p_rm = par_sub.add_parser("remove", help="Remove variant from library")
    p_rm.add_argument("game")
    p_rm.add_argument("variant")

    # ir
    ir = sub.add_parser("ir", help="Game IR build")
    ir_sub = ir.add_subparsers(dest="ir_action", required=True)
    ir_build = ir_sub.add_parser("build", help="Build IR from canonical PAR")
    ir_build.add_argument("game")
    ir_build.add_argument("variant")

    # mc
    mc = sub.add_parser("mc", help="MC convergence sweep")
    mc_sub = mc.add_subparsers(dest="mc_action", required=True)
    mc_run = mc_sub.add_parser("run", help="Run MC sweep at tier")
    mc_run.add_argument("game")
    mc_run.add_argument("variant")
    mc_run.add_argument("--tier", default="T1", help="T1..T5")

    # deploy
    dp = sub.add_parser("deploy", help="Auto-deploy web + RGS bundle")
    dp.add_argument("game")
    dp.add_argument("variant")
    dp.add_argument("--skin", default=None, help="Path to skin asset folder")

    # critique
    cr = sub.add_parser("critique", help="Run PAR critique heuristic")
    cr.add_argument("par_path", help="Path to canonical.par.yaml")

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.cmd == "par":
        return _cmd_par(args)
    if args.cmd == "ir" and args.ir_action == "build":
        return _cmd_ir(args)
    if args.cmd == "mc" and args.mc_action == "run":
        return _cmd_mc(args)
    if args.cmd == "deploy":
        return _cmd_deploy(args)
    if args.cmd == "critique":
        return _cmd_critique(args)
    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

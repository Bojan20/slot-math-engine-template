"""SLOT-MATH W244 CLI — one-shot game evaluator.

Usage:

    python3 -m tools.par_kernels.cli evaluate <ir_path> --cf <cf_path>
    python3 -m tools.par_kernels.cli evaluate --game wrath-of-olympus --variant v12.0.0
    python3 -m tools.par_kernels.cli evaluate <ir_path> --cf <cf_path> --mc-spins 1000000

Workflow:
  1. Load IR + closed-form RTP source
  2. Dispatch W244 kernels via tools/par_to_ir/dispatcher.py
  3. Run composer.compose() with the generic params_builder
  4. If --mc-spins > 0: also run MC runtime sampler
  5. Emit a unified Markdown report to stdout (or --out)
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]


def _resolve_game(game: str, variant: str) -> tuple[Path, Path]:
    """Resolve IR + CF paths for a known game/variant in the PAR library."""
    base = REPO / "reports" / "par-library" / game / variant
    ir = base / "game.ir.json"
    cf = base / "closed-form-rtp.json"
    if not ir.is_file():
        raise FileNotFoundError(f"IR not found: {ir}")
    if not cf.is_file():
        raise FileNotFoundError(f"CF source not found: {cf}")
    return ir, cf


def _format_report(
    game_id: str,
    cf_target: float,
    composition_result,
    delegated_offset: float,
    mc_result=None,
    wallclock: dict[str, float] | None = None,
) -> str:
    lines = []
    composed_total = composition_result.composed_rtp + delegated_offset
    delta_bps = (composed_total - cf_target) * 10000.0

    lines.append(f"# SLOT-MATH Evaluation — {game_id}")
    lines.append("")
    lines.append("## Closed-form composition")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|---|---|")
    lines.append(f"| CF target RTP | {cf_target:.6%} |")
    lines.append(f"| Composed RTP (W244 kernels) | {composition_result.composed_rtp:.6%} |")
    lines.append(f"| Delegated baseline (per-line + scatter + lightning) | {delegated_offset:.6%} |")
    lines.append(f"| **Total** | **{composed_total:.6%}** |")
    lines.append(f"| Δ vs CF target | {delta_bps:+.4f} bps |")
    pass_emoji = "✅" if abs(delta_bps) <= 1.0 else "⚠️"
    lines.append(f"| Composer parity (≤ 1 bps) | {pass_emoji} |")
    lines.append("")
    lines.append("### Per-kernel breakdown")
    lines.append("")
    lines.append("| Kernel | Feature | RTP contribution | Status |")
    lines.append("|---|---|---:|:---:|")
    for k in composition_result.per_kernel:
        if k.error:
            status = "⚠️ delegated"
        else:
            status = "✅"
        lines.append(f"| {k.kernel_id} | {k.feature_kind} | {k.rtp_contribution:.6%} | {status} |")
    lines.append("")

    if mc_result is not None:
        lines.append("## Monte Carlo runtime")
        lines.append("")
        lines.append("| Metric | Value |")
        lines.append("|---|---|")
        lines.append(f"| Spins | {mc_result.spins:,} |")
        lines.append(f"| Measured RTP | {mc_result.rtp:.6%} |")
        lines.append(f"| Std error | ±{mc_result.std_error:.6%} |")
        lines.append(f"| Wilson 99% CI half-width | ±{mc_result.wilson_99_halfwidth:.6%} |")
        lines.append(f"| Δ vs CF target | {mc_result.delta_bps:+.2f} bps |")
        mc_pass = "✅" if mc_result.convergence_pass else "🔴"
        lines.append(f"| Convergence (within Wilson 99% CI) | {mc_pass} |")
        lines.append(f"| Hit rate | {mc_result.hit_rate:.4%} |")
        lines.append(f"| FS trigger | 1/{1.0/mc_result.fs_trigger_rate:.2f} |" if mc_result.fs_trigger_rate > 0 else "| FS trigger | none |")
        lines.append(f"| H&W trigger | 1/{1.0/mc_result.hnw_trigger_rate:.2f} |" if mc_result.hnw_trigger_rate > 0 else "| H&W trigger | none |")
        lines.append(f"| Max win observed | {mc_result.max_win_x:.2f}× |")
        if wallclock and "mc" in wallclock:
            rate = mc_result.spins / wallclock["mc"] if wallclock["mc"] > 0 else 0
            lines.append(f"| Throughput | {rate:,.0f} spins/sec |")
        lines.append("")

    if wallclock:
        lines.append("## Performance")
        lines.append("")
        for k, v in wallclock.items():
            lines.append(f"- {k}: {v*1000:.1f} ms")
        lines.append("")

    return "\n".join(lines)


def cmd_evaluate(args: argparse.Namespace) -> int:
    # Resolve IR + CF
    if args.game:
        ir_path, cf_path = _resolve_game(args.game, args.variant or "v12.0.0")
    else:
        if not args.ir_path:
            print("ERROR: provide either --game or positional ir_path", file=sys.stderr)
            return 2
        ir_path = Path(args.ir_path)
        if not args.cf:
            print("ERROR: --cf is required when --game is not used", file=sys.stderr)
            return 2
        cf_path = Path(args.cf)

    ir = json.loads(ir_path.read_text())
    cf = json.loads(cf_path.read_text())

    from tools.par_kernels.composer import compose
    from tools.par_kernels.generic_params import (
        delegated_baseline_rtp,
        make_params_builder,
    )

    target_rtp = cf.get("total_rtp", 0.0)
    par = {"rtp": {"rtp_total": target_rtp}}
    game_id = ir.get("meta", {}).get("id", "unknown")

    wallclock = {}

    # Composer
    t0 = time.perf_counter()
    builder = make_params_builder(cf)
    comp_result = compose(ir, par=par, params_builder=builder, tolerance_bps=args.tolerance_bps)
    wallclock["composer"] = time.perf_counter() - t0

    delegated = delegated_baseline_rtp(cf)

    # MC (optional)
    mc_result = None
    if args.mc_spins > 0:
        from tools.par_kernels.mc_runtime import (
            build_wrath_executor_from_cf,
            run_mc,
        )
        executor = build_wrath_executor_from_cf(cf)
        t0 = time.perf_counter()
        mc_result = run_mc(
            executor, spins=args.mc_spins, seed=args.seed,
            cf_target_rtp=target_rtp,
        )
        wallclock["mc"] = time.perf_counter() - t0

    report = _format_report(
        game_id=game_id,
        cf_target=target_rtp,
        composition_result=comp_result,
        delegated_offset=delegated,
        mc_result=mc_result,
        wallclock=wallclock,
    )

    if args.out:
        Path(args.out).write_text(report)
        print(f"Report written to {args.out}", file=sys.stderr)
    else:
        print(report)

    # Exit code reflects composer pass/fail
    composed_total = comp_result.composed_rtp + delegated
    delta_bps = (composed_total - target_rtp) * 10000.0
    return 0 if abs(delta_bps) <= args.tolerance_bps else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-math",
        description="SLOT-MATH W244 evaluator — composer + MC runtime in one shot",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_eval = sub.add_parser("evaluate", help="Run composer + (optional) MC against a game")
    p_eval.add_argument("ir_path", nargs="?", help="Path to game.ir.json (optional if --game)")
    p_eval.add_argument("--cf", help="Path to closed-form RTP JSON")
    p_eval.add_argument("--game", help="Use a known game from reports/par-library/")
    p_eval.add_argument("--variant", help="Variant tag (default v12.0.0)")
    p_eval.add_argument("--mc-spins", type=int, default=0, help="If > 0, run MC sampler with this many spins")
    p_eval.add_argument("--seed", type=int, default=42)
    p_eval.add_argument("--tolerance-bps", type=float, default=1.0)
    p_eval.add_argument("--out", help="Write Markdown report to this path (default stdout)")
    p_eval.set_defaults(func=cmd_evaluate)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

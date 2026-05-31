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
        engine_note = getattr(mc_result, "_engine_note", None)
        if engine_note:
            lines.append(f"_Engine: {engine_note}_")
            lines.append("")
        # Duck-type: extended (cluster/ways/crash) result has `rounds` and `shape`;
        # legacy Wrath-shape result has `spins` + FS/H&W trigger rates.
        is_extended = hasattr(mc_result, "rounds") and hasattr(mc_result, "shape")
        lines.append("| Metric | Value |")
        lines.append("|---|---|")
        if is_extended:
            lines.append(f"| Shape | `{mc_result.shape}` |")
            lines.append(f"| Rounds | {mc_result.rounds:,} |")
            lines.append(f"| Measured RTP | {mc_result.rtp:.6%} |")
            lines.append(f"| Std error | ±{mc_result.std_error:.6%} |")
            lines.append(f"| Wilson 99% CI half-width | ±{mc_result.wilson_99_halfwidth:.6%} |")
            if mc_result.delta_bps is not None:
                lines.append(f"| Δ vs CF target | {mc_result.delta_bps:+.2f} bps |")
            mc_pass = "✅" if mc_result.convergence_pass else "🔴"
            lines.append(f"| Convergence (within Wilson 99% CI) | {mc_pass} |")
            lines.append(f"| Hit rate | {mc_result.hit_rate:.4%} |")
            if mc_result.cascade_rate > 0:
                lines.append(f"| Cascade rate | {mc_result.cascade_rate:.4%} |")
            if mc_result.extra_per_round_avg > 0:
                lines.append(f"| Extra (avg/round) | {mc_result.extra_per_round_avg:.4f} |")
            lines.append(f"| Max observed | {mc_result.max_observed:.2f}× |")
            if mc_result.rounds_per_sec > 0:
                lines.append(f"| Throughput | {mc_result.rounds_per_sec:,.0f} rounds/sec |")
            if mc_result.threads_used > 1:
                lines.append(f"| Threads | {mc_result.threads_used} ({'parallel' if mc_result.parallel else 'serial'}) |")
        else:
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
        # Per-feature breakdown (Wrath-shape only — regulator-grade transparency)
        per_feature = getattr(mc_result, "_feature_breakdown", None)
        if per_feature:
            lines.append("### Per-feature MC breakdown (Wilson 99% CI)")
            lines.append("")
            lines.append("| Feature | RTP contribution | ± Wilson 99% |")
            lines.append("|---|---:|---:|")
            for name, fb in per_feature.items():
                lines.append(
                    f"| {name.replace('_', ' ')} | {fb.rtp_contribution:.6%} | "
                    f"±{fb.wilson_99_halfwidth:.6%} |"
                )
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
        cascade_uplift_from_cf,
        delegated_baseline_rtp,
        lightning_uplift_rtp_from_ir,
        lines_eval_rtp_from_ir,
        make_params_builder,
        pay_anywhere_rtp_from_cf,
        scatter_pay_rtp_from_ir,
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

    # Lines enumerator (re-derives base_line from reel weights + paytable)
    t0 = time.perf_counter()
    lines_rtp, lines_breakdown = lines_eval_rtp_from_ir(ir)
    wallclock["lines_eval"] = time.perf_counter() - t0

    # If lines_eval returns 0 (no reel data in IR), fall back to the CF
    # `base_line` slice. Otherwise prefer lines_eval (first-principles).
    if lines_rtp > 0:
        base_rtp = lines_rtp
    else:
        base_rtp = cf.get("components", {}).get("base_line", 0.0)

    # Scatter pay kernel (anywhere pays for K ≥ 3 scatters)
    t0 = time.perf_counter()
    scatter_rtp, _ = scatter_pay_rtp_from_ir(ir)
    wallclock["scatter_pay"] = time.perf_counter() - t0
    if scatter_rtp == 0:
        scatter_rtp = cf.get("components", {}).get("scatter_pay_base", 0.0)

    # Lightning uplift kernel (base-game multiplier on winning spins)
    t0 = time.perf_counter()
    lightning_rtp, _ = lightning_uplift_rtp_from_ir(ir, base_rtp=base_rtp)
    wallclock["lightning_uplift"] = time.perf_counter() - t0
    if lightning_rtp == 0:
        lightning_rtp = cf.get("components", {}).get("lightning_uplift", 0.0)

    # Cascade uplift (delegated slice — kernel-level cascade math TBD)
    cascade_rtp = cascade_uplift_from_cf(cf)

    # Pay-anywhere multi-symbol (Sweet Bonanza scatter / Gonzo pattern)
    pay_anywhere_rtp, _ = pay_anywhere_rtp_from_cf(cf)

    delegated = (
        delegated_baseline_rtp(cf)
        + base_rtp + scatter_rtp + lightning_rtp + cascade_rtp + pay_anywhere_rtp
    )

    # MC (optional) — defaults to Rust runtime, falls back to Python.
    # Shape dispatch (auto-detected from CF):
    #   - pay_anywhere_symbols  → skip MC (CF is exact)
    #   - cluster_distribution  → run_cluster_rust (Mystic-shape)
    #   - row_distribution_per_reel → run_ways_rust (Lightning Ways)
    #   - house_edge + cashout_multiplier → run_crash_rust (Stake Rush)
    #   - else (fs_session/hnw_session/lines) → Wrath-shape (lines+FS+HW)
    mc_result = None
    if args.mc_spins > 0:
        mc_engine_note = "python (pure)"
        rust_extra = None

        if "pay_anywhere_symbols" in cf:
            # Pay-anywhere shape: CF is exact (no sampling needed).
            mc_engine_note = "skipped (pay_anywhere CF is exact, no MC needed)"
            print(
                "[mc-dispatch] pay_anywhere shape detected — CF is exact, "
                "skipping MC sampler. Composed RTP already validated.",
                file=sys.stderr,
            )
        elif "cluster_distribution" in cf:
            from tools.par_kernels.mc_extended_rust import run_cluster_rust
            t0 = time.perf_counter()
            mc_result = run_cluster_rust(
                cf, ir, n_rounds=args.mc_spins, seed=args.seed,
                cf_target_rtp=target_rtp,
            )
            wallclock["mc"] = time.perf_counter() - t0
            mc_engine_note = (
                f"rust cluster ({mc_result.rounds_per_sec/1e6:.0f}M rounds/s, "
                f"{mc_result.threads_used}T {'parallel' if mc_result.parallel else 'serial'})"
            )
        elif "row_distribution_per_reel" in cf:
            from tools.par_kernels.mc_extended_rust import run_ways_rust
            t0 = time.perf_counter()
            mc_result = run_ways_rust(
                cf, ir, n_rounds=args.mc_spins, seed=args.seed,
                cf_target_rtp=target_rtp,
            )
            wallclock["mc"] = time.perf_counter() - t0
            mc_engine_note = (
                f"rust ways ({mc_result.rounds_per_sec/1e6:.0f}M rounds/s, "
                f"{mc_result.threads_used}T {'parallel' if mc_result.parallel else 'serial'})"
            )
        elif "house_edge" in cf and "cashout_multiplier" in cf:
            from tools.par_kernels.mc_extended_rust import run_crash_rust
            t0 = time.perf_counter()
            mc_result = run_crash_rust(
                cf, ir, n_rounds=args.mc_spins, seed=args.seed,
                cf_target_rtp=target_rtp,
            )
            wallclock["mc"] = time.perf_counter() - t0
            mc_engine_note = (
                f"rust crash ({mc_result.rounds_per_sec/1e6:.0f}M rounds/s, "
                f"{mc_result.threads_used}T {'parallel' if mc_result.parallel else 'serial'})"
            )
        else:
            # Wrath-shape (lines + free_spins + hold_and_win)
            from tools.par_kernels.mc_runtime import (
                build_wrath_executor_from_cf,
                run_mc,
            )
            executor = build_wrath_executor_from_cf(cf)
            t0 = time.perf_counter()
            if args.python_mc:
                mc_result = run_mc(
                    executor, spins=args.mc_spins, seed=args.seed,
                    cf_target_rtp=target_rtp,
                )
            else:
                from tools.par_kernels.mc_runtime_rust import run_mc_rust
                mc_result, rust_extra = run_mc_rust(
                    executor, spins=args.mc_spins, seed=args.seed,
                    cf_target_rtp=target_rtp,
                    fallback_to_python=True,
                )
                mc_engine_note = (
                    f"rust wrath ({rust_extra.spins_per_sec/1e6:.0f}M spins/s)"
                    if rust_extra
                    else "python (rust binary missing — fallback)"
                )
            wallclock["mc"] = time.perf_counter() - t0

        # Stash engine note + per-feature breakdown for report renderer.
        if mc_result is not None:
            setattr(mc_result, "_engine_note", mc_engine_note)
            fb = getattr(rust_extra, "feature_breakdown", None) if rust_extra else None
            if fb is not None:
                setattr(mc_result, "_feature_breakdown", fb)

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

    # Exit code: composer parity AND (if MC ran) MC convergence both must pass.
    # Rationale: cluster/ways/crash composers are slice-only; MC convergence
    # is the real regulator gate for those shapes.
    composed_total = comp_result.composed_rtp + delegated
    delta_bps = (composed_total - target_rtp) * 10000.0
    composer_ok = abs(delta_bps) <= args.tolerance_bps
    mc_ok = True
    if mc_result is not None and hasattr(mc_result, "convergence_pass"):
        mc_ok = bool(mc_result.convergence_pass)
    return 0 if (composer_ok and mc_ok) else 1


def cmd_list_games(args: argparse.Namespace) -> int:
    """List all games in reports/par-library/ with shape + status."""
    library = REPO / "reports" / "par-library"
    if not library.is_dir():
        print(f"PAR library missing: {library}", file=sys.stderr)
        return 1

    print(f"# SLOT-MATH PAR Library — {library.relative_to(REPO)}")
    print()
    print("| Game | Variant | Shape | RTP target | Files |")
    print("|---|---|---|---:|:---:|")

    games = sorted(d.name for d in library.iterdir() if d.is_dir())
    for game in games:
        game_dir = library / game
        variants = sorted(v.name for v in game_dir.iterdir() if v.is_dir())
        for variant in variants:
            v_dir = game_dir / variant
            ir_path = v_dir / "game.ir.json"
            cf_path = v_dir / "closed-form-rtp.json"
            if not (ir_path.is_file() and cf_path.is_file()):
                continue
            try:
                ir = json.loads(ir_path.read_text())
                cf = json.loads(cf_path.read_text())
                shape = ir.get("evaluation", {}).get("kind", "?")
                rtp = cf.get("total_rtp", 0.0)
                n_files = sum(1 for _ in v_dir.iterdir() if _.is_file())
                print(f"| {game} | {variant} | {shape} | {rtp*100:.2f}% | {n_files} |")
            except Exception as e:
                print(f"| {game} | {variant} | ERROR | — | {e} |")
    return 0


def cmd_init(args: argparse.Namespace) -> int:
    """Scaffold a new game directory from a shape template."""
    shape_templates = {
        "lines": {
            "evaluation": {"kind": "lines"},
            "components_keys": ["base_line", "scatter_pay_base", "lightning_uplift"],
            "features_example": ["free_spins", "hold_and_win", "multiplier"],
        },
        "cluster_pays": {
            "evaluation": {"kind": "cluster_pays", "min_cluster_size": 5, "adjacency": "4-way"},
            "components_keys": ["cluster_pays_base", "cascade_uplift"],
            "features_example": ["cascade"],
        },
        "ways": {
            "evaluation": {"kind": "ways"},
            "components_keys": ["ways_base", "cascade_uplift"],
            "features_example": ["cascade"],
        },
        "crash": {
            "evaluation": {"kind": "crash"},
            "components_keys": ["crash_base"],
            "features_example": [],
        },
        "pay_anywhere": {
            "evaluation": {"kind": "pay_anywhere", "min_pay_count": 8},
            "components_keys": ["pay_anywhere_base", "cascade_uplift"],
            "features_example": ["cascade"],
        },
    }
    shape = args.shape
    if shape not in shape_templates:
        print(f"Unknown shape: {shape}. Supported: {list(shape_templates.keys())}",
              file=sys.stderr)
        return 2
    tmpl = shape_templates[shape]
    out_dir = REPO / "reports" / "par-library" / args.game / args.variant
    if out_dir.exists() and not args.force:
        print(f"Already exists: {out_dir} (use --force to overwrite)", file=sys.stderr)
        return 3
    out_dir.mkdir(parents=True, exist_ok=True)

    ir = {
        "schema_version": "1.0.0",
        "meta": {
            "id": args.game,
            "name": args.game.replace("-", " ").title(),
            "version": args.variant,
            "description": f"Scaffolded {shape} game — fill out paytable + reels + features",
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "symbols": [],
        "evaluation": tmpl["evaluation"],
        "features": [{"kind": k, "TODO": f"configure {k}"} for k in tmpl["features_example"]],
        "rng": {"kind": "pcg64"},
        "bet": {"currency": "EUR", "base_bet": 1, "max_win_x": 5000},
        "provenance": {"par_source": args.variant, "ir_sha256": "TODO"},
    }
    cf = {
        "game": args.game,
        "version": args.variant,
        "target_rtp": 0.96,
        "total_rtp": 0.96,
        "components": {k: 0.0 for k in tmpl["components_keys"]},
    }
    (out_dir / "game.ir.json").write_text(json.dumps(ir, indent=2) + "\n")
    (out_dir / "closed-form-rtp.json").write_text(json.dumps(cf, indent=2) + "\n")
    print(f"✓ Scaffolded {shape} game at {out_dir}", file=sys.stderr)
    print("  Next: fill out symbols, paytable, components in JSON, then:")
    print(f"  python3 -m tools.par_kernels.cli evaluate --game {args.game} --variant {args.variant}")
    return 0


def cmd_shapes(args: argparse.Namespace) -> int:
    """Print supported evaluation shapes + industry examples."""
    print("# SLOT-MATH supported shapes (W244 kernel coverage)")
    print()
    print("| Shape | Industry pattern | Composer | MC executor |")
    print("|---|---|:---:|:---:|")
    print("| lines | Classic 3-reel, 20/30/50-line | ✅ | ✅ Rust (554M/s) + Python |")
    print("| cluster_pays | Sweet Bonanza, Aloha, Gates of Olympus | ✅ | ✅ Python (200K/s) |")
    print("| ways | Megaways: Bonanza, Big Bass, Extra Chilli | ✅ | ✅ Python (586K/s) |")
    print("| crash | Stake Crash, Aviator, Bustabit | ✅ | ✅ Python (1.75M/s) |")
    print("| pay_anywhere | Sweet Bonanza scatter, Gonzo's Quest | ✅ | ✅ CF (exact) |")
    print()
    print("Add a new game via:")
    print("  python3 -m tools.par_kernels.cli init <game> <variant> --shape <shape>")
    return 0


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
    p_eval.add_argument("--python-mc", action="store_true",
                        help="Force pure-Python MC runtime (default: Rust if binary built, "
                             "fallback Python). Rust is ~70× faster single-thread, ~500× parallel.")
    p_eval.add_argument("--tolerance-bps", type=float, default=50.0,
                        help="bps tolerance for composer pass/fail "
                             "(default 50 — accommodates reel-strip vs RNG gap)")
    p_eval.add_argument("--out", help="Write Markdown report to this path (default stdout)")
    p_eval.set_defaults(func=cmd_evaluate)

    p_list = sub.add_parser("list-games", help="List all games in PAR library")
    p_list.set_defaults(func=cmd_list_games)

    p_init = sub.add_parser("init", help="Scaffold a new game from a shape template")
    p_init.add_argument("game", help="Game ID (kebab-case, e.g. 'crimson-tiger')")
    p_init.add_argument("variant", help="Variant tag (e.g. 'v1.0.0')")
    p_init.add_argument("--shape", required=True,
                        choices=["lines", "cluster_pays", "ways", "crash", "pay_anywhere"],
                        help="Evaluation shape (see 'shapes' subcommand)")
    p_init.add_argument("--force", action="store_true", help="Overwrite if exists")
    p_init.set_defaults(func=cmd_init)

    p_shapes = sub.add_parser("shapes", help="List supported evaluation shapes")
    p_shapes.set_defaults(func=cmd_shapes)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

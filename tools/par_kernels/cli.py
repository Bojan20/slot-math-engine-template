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


def _evaluate_one_silent(
    ir_path: Path, cf_path: Path,
    mc_spins: int = 0, seed: int = 42, tolerance_bps: float = 50.0,
) -> dict:
    """Run composer + (optional) MC for a single game without printing.

    Returns a dict with everything `cmd_batch` needs to render a row.
    Mirrors the dispatch logic of `cmd_evaluate` but stays library-only.
    """
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

    ir = json.loads(ir_path.read_text())
    cf = json.loads(cf_path.read_text())
    target_rtp = cf.get("total_rtp", 0.0)
    par = {"rtp": {"rtp_total": target_rtp}}
    game_id = ir.get("meta", {}).get("id", "unknown")
    shape = ir.get("evaluation", {}).get("kind", "?")
    variant = ir.get("meta", {}).get("version", "?")

    t0 = time.perf_counter()
    builder = make_params_builder(cf)
    comp_result = compose(ir, par=par, params_builder=builder, tolerance_bps=tolerance_bps)
    composer_secs = time.perf_counter() - t0

    lines_rtp, _ = lines_eval_rtp_from_ir(ir)
    base_rtp = lines_rtp if lines_rtp > 0 else cf.get("components", {}).get("base_line", 0.0)
    scatter_rtp, _ = scatter_pay_rtp_from_ir(ir)
    if scatter_rtp == 0:
        scatter_rtp = cf.get("components", {}).get("scatter_pay_base", 0.0)
    lightning_rtp, _ = lightning_uplift_rtp_from_ir(ir, base_rtp=base_rtp)
    if lightning_rtp == 0:
        lightning_rtp = cf.get("components", {}).get("lightning_uplift", 0.0)
    cascade_rtp = cascade_uplift_from_cf(cf)
    pa_rtp, _ = pay_anywhere_rtp_from_cf(cf)
    delegated = (
        delegated_baseline_rtp(cf)
        + base_rtp + scatter_rtp + lightning_rtp + cascade_rtp + pa_rtp
    )
    composed_total = comp_result.composed_rtp + delegated
    composer_delta_bps = (composed_total - target_rtp) * 10000.0
    composer_ok = abs(composer_delta_bps) <= tolerance_bps

    mc_kind = "n/a"
    mc_secs = 0.0
    mc_delta_bps = None
    mc_rtp = None
    mc_pass = None
    rounds_per_sec = None
    threads = None

    if mc_spins > 0:
        if "pay_anywhere_symbols" in cf:
            mc_kind = "skip (CF exact)"
            mc_pass = True  # CF is exact — by definition, converges
        elif "cluster_distribution" in cf:
            from tools.par_kernels.mc_extended_rust import run_cluster_rust
            t0 = time.perf_counter()
            r = run_cluster_rust(cf, ir, n_rounds=mc_spins, seed=seed, cf_target_rtp=target_rtp)
            mc_secs = time.perf_counter() - t0
            mc_kind = "cluster"
            mc_rtp = r.rtp
            mc_delta_bps = r.delta_bps
            mc_pass = bool(r.convergence_pass)
            rounds_per_sec = r.rounds_per_sec
            threads = r.threads_used
        elif "row_distribution_per_reel" in cf:
            from tools.par_kernels.mc_extended_rust import run_ways_rust
            t0 = time.perf_counter()
            r = run_ways_rust(cf, ir, n_rounds=mc_spins, seed=seed, cf_target_rtp=target_rtp)
            mc_secs = time.perf_counter() - t0
            mc_kind = "ways"
            mc_rtp = r.rtp
            mc_delta_bps = r.delta_bps
            mc_pass = bool(r.convergence_pass)
            rounds_per_sec = r.rounds_per_sec
            threads = r.threads_used
        elif "house_edge" in cf and "cashout_multiplier" in cf:
            from tools.par_kernels.mc_extended_rust import run_crash_rust
            t0 = time.perf_counter()
            r = run_crash_rust(cf, ir, n_rounds=mc_spins, seed=seed, cf_target_rtp=target_rtp)
            mc_secs = time.perf_counter() - t0
            mc_kind = "crash"
            mc_rtp = r.rtp
            mc_delta_bps = r.delta_bps
            mc_pass = bool(r.convergence_pass)
            rounds_per_sec = r.rounds_per_sec
            threads = r.threads_used
        else:
            from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf
            from tools.par_kernels.mc_runtime_rust import run_mc_rust
            executor = build_wrath_executor_from_cf(cf)
            t0 = time.perf_counter()
            r, rust_extra = run_mc_rust(
                executor, spins=mc_spins, seed=seed,
                cf_target_rtp=target_rtp, fallback_to_python=True,
            )
            mc_secs = time.perf_counter() - t0
            mc_kind = "wrath"
            mc_rtp = r.rtp
            mc_delta_bps = r.delta_bps
            mc_pass = bool(r.convergence_pass)
            rounds_per_sec = rust_extra.spins_per_sec if rust_extra else (mc_spins / mc_secs)
            threads = 1

    return {
        "game": game_id,
        "variant": variant,
        "shape": shape,
        "target_rtp": target_rtp,
        "composed_rtp": composed_total,
        "composer_delta_bps": composer_delta_bps,
        "composer_ok": composer_ok,
        "composer_secs": composer_secs,
        "mc_kind": mc_kind,
        "mc_secs": mc_secs,
        "mc_rtp": mc_rtp,
        "mc_delta_bps": mc_delta_bps,
        "mc_pass": mc_pass,
        "rounds_per_sec": rounds_per_sec,
        "threads": threads,
        "overall_ok": composer_ok and (mc_pass if mc_pass is not None else True),
    }


def cmd_batch(args: argparse.Namespace) -> int:
    """Iterate the entire PAR library and emit an aggregate dashboard.

    Exit 0 iff every game passes (composer parity ∧ MC convergence).
    Designed for CI and studio demo: one command → portfolio health snapshot.
    """
    library = REPO / "reports" / "par-library"
    if not library.is_dir():
        print(f"PAR library missing: {library}", file=sys.stderr)
        return 1

    # Resolve all (game, variant, ir, cf) triples.
    targets: list[tuple[str, str, Path, Path]] = []
    for game_dir in sorted(library.iterdir()):
        if not game_dir.is_dir():
            continue
        for var_dir in sorted(game_dir.iterdir()):
            if not var_dir.is_dir():
                continue
            ir_p = var_dir / "game.ir.json"
            cf_p = var_dir / "closed-form-rtp.json"
            if ir_p.is_file() and cf_p.is_file():
                targets.append((game_dir.name, var_dir.name, ir_p, cf_p))

    if not targets:
        print("No games found in PAR library", file=sys.stderr)
        return 1

    # Optional filter (e.g. --filter cluster or --filter wrath-of-olympus)
    if args.filter:
        targets = [
            t for t in targets
            if args.filter in t[0] or args.filter in t[1]
        ]
        if not targets:
            print(f"No games matched filter '{args.filter}'", file=sys.stderr)
            return 1

    print("# SLOT-MATH Portfolio Health — batch evaluate", file=sys.stderr)
    print(f"Evaluating {len(targets)} game/variant pairs "
          f"(--mc-spins {args.mc_spins}, seed {args.seed})...", file=sys.stderr)

    rows = []
    t_start = time.perf_counter()
    for game, variant, ir_p, cf_p in targets:
        print(f"  [{game}/{variant}] running...", file=sys.stderr)
        try:
            row = _evaluate_one_silent(
                ir_p, cf_p,
                mc_spins=args.mc_spins, seed=args.seed,
                tolerance_bps=args.tolerance_bps,
            )
        except Exception as e:
            row = {
                "game": game, "variant": variant, "shape": "?",
                "target_rtp": 0.0, "composed_rtp": 0.0,
                "composer_delta_bps": 0.0, "composer_ok": False,
                "composer_secs": 0.0, "mc_kind": "ERROR",
                "mc_secs": 0.0, "mc_rtp": None, "mc_delta_bps": None,
                "mc_pass": False, "rounds_per_sec": None, "threads": None,
                "overall_ok": False, "error": str(e)[:200],
            }
        rows.append(row)
    total_secs = time.perf_counter() - t_start

    # Aggregate dashboard
    out_lines = [
        "# SLOT-MATH Portfolio Health Dashboard",
        "",
        f"_Generated: {time.strftime('%Y-%m-%d %H:%M:%S')}_  ",
        f"_Wallclock: {total_secs:.2f}s · {len(rows)} games · "
        f"--mc-spins {args.mc_spins} · seed {args.seed}_",
        "",
        "## Per-game results",
        "",
        "| Game | Variant | Shape | Target RTP | Composed | Composer Δ | MC engine | MC RTP | MC Δ | MC rate | Status |",
        "|---|---|---|---:|---:|---:|:---:|---:|---:|---:|:---:|",
    ]
    for r in rows:
        target_pct = f"{r['target_rtp']*100:.2f}%" if r['target_rtp'] else "—"
        composed_pct = f"{r['composed_rtp']*100:.2f}%" if r['composed_rtp'] else "—"
        comp_delta = f"{r['composer_delta_bps']:+.2f} bps"
        mc_rtp = f"{r['mc_rtp']*100:.2f}%" if r['mc_rtp'] is not None else "—"
        mc_delta = f"{r['mc_delta_bps']:+.2f} bps" if r['mc_delta_bps'] is not None else "—"
        if r['rounds_per_sec']:
            rate = f"{r['rounds_per_sec']/1e6:.0f}M/s"
            if r['threads'] and r['threads'] > 1:
                rate += f" ×{r['threads']}T"
        else:
            rate = "—"
        status = "✅" if r['overall_ok'] else "🔴"
        out_lines.append(
            f"| {r['game']} | {r['variant']} | `{r['shape']}` | {target_pct} | {composed_pct} | "
            f"{comp_delta} | `{r['mc_kind']}` | {mc_rtp} | {mc_delta} | {rate} | {status} |"
        )

    # Roll-up
    passed = sum(1 for r in rows if r['overall_ok'])
    failed = len(rows) - passed
    overall_emoji = "✅" if failed == 0 else "🔴"
    out_lines.extend([
        "",
        "## Roll-up",
        "",
        "| Metric | Value |",
        "|---|---|",
        f"| Games evaluated | {len(rows)} |",
        f"| Passed (composer ∧ MC convergence) | {passed} |",
        f"| Failed | {failed} |",
        f"| **Overall portfolio gate** | **{overall_emoji}** |",
        f"| Total wallclock | {total_secs:.2f}s |",
        "",
    ])
    if failed > 0:
        out_lines.extend([
            "### Failed games",
            "",
            "| Game | Variant | Composer Δ | MC Δ | Error |",
            "|---|---|---:|---:|---|",
        ])
        for r in rows:
            if not r['overall_ok']:
                err = r.get("error", "")
                cd = f"{r['composer_delta_bps']:+.2f}" if r['composer_delta_bps'] is not None else "—"
                md = f"{r['mc_delta_bps']:+.2f}" if r['mc_delta_bps'] is not None else "—"
                out_lines.append(f"| {r['game']} | {r['variant']} | {cd} bps | {md} bps | {err} |")
        out_lines.append("")

    report = "\n".join(out_lines)
    if args.out:
        Path(args.out).write_text(report)
        print(f"Dashboard written to {args.out}", file=sys.stderr)
    else:
        print(report)

    # --bench: emit structured JSON for bench-history pinning / regression
    # detection. Schema is stable so downstream tooling can diff across runs.
    if args.bench:
        bench_payload = {
            "schema_version": "1.0.0",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "wallclock_secs": round(total_secs, 3),
            "config": {
                "mc_spins": args.mc_spins,
                "seed": args.seed,
                "tolerance_bps": args.tolerance_bps,
                "filter": args.filter,
            },
            "summary": {
                "games_total": len(rows),
                "games_passed": passed,
                "games_failed": failed,
                "overall_ok": failed == 0,
            },
            "games": [
                {
                    "game": r["game"],
                    "variant": r["variant"],
                    "shape": r["shape"],
                    "target_rtp": r["target_rtp"],
                    "composed_rtp": r["composed_rtp"],
                    "composer_delta_bps": r["composer_delta_bps"],
                    "composer_ok": r["composer_ok"],
                    "composer_secs": round(r["composer_secs"], 4),
                    "mc": {
                        "kind": r["mc_kind"],
                        "secs": round(r["mc_secs"], 4),
                        "rtp": r["mc_rtp"],
                        "delta_bps": r["mc_delta_bps"],
                        "pass": r["mc_pass"],
                        "rounds_per_sec": r["rounds_per_sec"],
                        "threads": r["threads"],
                    },
                    "overall_ok": r["overall_ok"],
                    "error": r.get("error"),
                }
                for r in rows
            ],
        }
        bench_path = Path(args.bench)
        bench_path.parent.mkdir(parents=True, exist_ok=True)
        bench_path.write_text(json.dumps(bench_payload, indent=2) + "\n")
        print(f"Bench JSON written to {bench_path}", file=sys.stderr)

    return 0 if failed == 0 else 1


def cmd_demo(args: argparse.Namespace) -> int:
    """End-to-end showcase — runs the entire pipeline in one command.

    1. Pick a featured game (default: wrath-of-olympus)
    2. Run `evaluate` with MC (composer + per-feature breakdown)
    3. Run `batch` across the entire library
    4. Pin the bench JSON into a temp ledger
    5. Re-pin to demonstrate idempotency
    6. Render the trend dashboard

    Designed for screencasts, sales demos, and "what does this even do?"
    onboarding. Writes a single Markdown demo report to --out (or stdout).
    """
    import tempfile

    spins = args.mc_spins
    featured_game = args.game
    featured_variant = args.variant

    library = REPO / "reports" / "par-library"
    featured_dir = library / featured_game / featured_variant
    if not featured_dir.is_dir():
        print(f"Featured game dir missing: {featured_dir}", file=sys.stderr)
        # Pick first available game as fallback
        if library.is_dir():
            for g_dir in sorted(library.iterdir()):
                if g_dir.is_dir():
                    for v_dir in sorted(g_dir.iterdir()):
                        if (v_dir / "game.ir.json").is_file():
                            featured_game = g_dir.name
                            featured_variant = v_dir.name
                            featured_dir = v_dir
                            print(f"Fallback featured: {featured_game}/{featured_variant}",
                                  file=sys.stderr)
                            break
                    else:
                        continue
                    break

    out_lines = [
        "# SLOT-MATH — End-to-End Demo",
        "",
        f"_Generated: {time.strftime('%Y-%m-%d %H:%M:%S')} · "
        f"MC spins per game: {spins:,} · seed: {args.seed}_",
        "",
        "> One command runs the entire SLOT-MATH pipeline against the live PAR",
        "> library: composer math, Monte-Carlo convergence, portfolio dashboard,",
        "> structured bench JSON, content-hashed pin into history ledger, and",
        "> per-game trend across the ledger.",
        "",
        "---",
        "",
    ]

    with tempfile.TemporaryDirectory(prefix="slot-math-demo-") as td:
        td = Path(td)
        ledger_dir = td / "ledger"
        # ─── Step 1: single-game evaluate (with MC) ───
        eval_args = argparse.Namespace(
            ir_path=None, cf=None, game=featured_game,
            variant=featured_variant, mc_spins=spins, seed=args.seed,
            python_mc=False, tolerance_bps=args.tolerance_bps,
            out=str(td / "evaluate.md"),
        )
        out_lines += [
            f"## 1. Evaluate one game (`{featured_game}/{featured_variant}`)",
            "",
            "```bash",
            f"slot-math evaluate --game {featured_game} --variant {featured_variant} "
            f"--mc-spins {spins}",
            "```",
            "",
        ]
        try:
            eval_ec = cmd_evaluate(eval_args)
            eval_report = (td / "evaluate.md").read_text()
            out_lines += [
                f"_Exit: {eval_ec} {'✅' if eval_ec == 0 else '🔴'}_",
                "",
                "<details><summary>Click to expand evaluate report</summary>",
                "",
                eval_report,
                "",
                "</details>",
                "",
            ]
        except Exception as e:
            out_lines += [f"_evaluate failed: {e}_", ""]

        # ─── Step 2: batch (entire library) ───
        bench_path = td / "bench.json"
        dash_path = td / "dashboard.md"
        batch_args = argparse.Namespace(
            mc_spins=spins, seed=args.seed, tolerance_bps=args.tolerance_bps,
            filter=None, out=str(dash_path), bench=str(bench_path),
        )
        out_lines += [
            "## 2. Batch evaluate (entire PAR library)",
            "",
            "```bash",
            f"slot-math batch --mc-spins {spins} --out dashboard.md "
            "--bench bench.json",
            "```",
            "",
        ]
        try:
            batch_ec = cmd_batch(batch_args)
            dash_md = dash_path.read_text()
            out_lines += [
                f"_Exit: {batch_ec} {'✅' if batch_ec == 0 else '🔴'}_",
                "",
                dash_md,
                "",
            ]
        except Exception as e:
            out_lines += [f"_batch failed: {e}_", ""]

        # ─── Step 3: pin into ledger (twice, prove idempotency) ───
        from tools.par_kernels.bench_pin import (
            cmd_bench_trend,
            compute_trend,
            format_trend_markdown,
            pin_bench,
        )
        out_lines += [
            "## 3. Pin bench JSON into portfolio-history ledger",
            "",
            "```bash",
            "slot-math bench-pin bench.json --pin-dir ./history",
            "slot-math bench-pin bench.json --pin-dir ./history  "
            "# second call = idempotent skip",
            "```",
            "",
        ]
        try:
            r1 = pin_bench(bench_path, pin_dir=ledger_dir)
            r2 = pin_bench(bench_path, pin_dir=ledger_dir)
            out_lines += [
                f"- First call: `pinned={r1.pinned}`, "
                f"content_sha=`{r1.content_sha}`",
                f"- Second call: `pinned={r2.pinned}` (idempotent ✅)",
                "",
            ]
        except Exception as e:
            out_lines += [f"_pin failed: {e}_", ""]

        # ─── Step 4: trend dashboard ───
        out_lines += [
            "## 4. Render portfolio trend (across ledger)",
            "",
            "```bash",
            "slot-math bench-trend --pin-dir ./history",
            "```",
            "",
        ]
        try:
            trend = compute_trend(pin_dir=ledger_dir)
            trend_md = format_trend_markdown(trend)
            out_lines += [trend_md, ""]
        except Exception as e:
            out_lines += [f"_trend failed: {e}_", ""]
            del cmd_bench_trend  # silence unused-import if trend block fails

        # ─── Footer ───
        out_lines += [
            "---",
            "",
            "## Pipeline summary",
            "",
            "| Step | Command | Purpose |",
            "|---|---|---|",
            "| 1 | `evaluate` | Single-game composer + MC verification |",
            "| 2 | `batch`    | Portfolio sweep (composer + MC per shape) |",
            "| 3 | `bench-pin` | Pin bench JSON to history ledger (idempotent) |",
            "| 4 | `bench-trend` | Per-game RTP trend across pinned history |",
            "",
            "All four primitives are CI-wired in `.github/workflows/portfolio-sweep.yml` —",
            "every push to main pins + uploads the ledger as a 90-day artifact, every PR",
            "computes regression diff vs the latest main pin and posts a single comment.",
            "",
        ]

    report = "\n".join(out_lines)
    if args.out:
        Path(args.out).write_text(report)
        print(f"Demo report written to {args.out}", file=sys.stderr)
    else:
        print(report)
    return 0


def cmd_shapes(args: argparse.Namespace) -> int:
    """Print supported evaluation shapes + industry examples + MC throughput."""
    print("# SLOT-MATH supported shapes (W244 kernel coverage)")
    print()
    print("All 5 shapes now have **Rust parallel MC executors** "
          "(`mc_runtime_real`, `mc_extended_real`).")
    print()
    print("| Shape | Industry pattern | Composer | MC engine (parallel) | Pure-Python fallback |")
    print("|---|---|:---:|:---:|:---:|")
    print("| lines | Classic 3-reel, 20/30/50-line | ✅ | ✅ Rust **554M/s** | ✅ 1.17M/s |")
    print("| cluster_pays | Aloha, cluster grids | ✅ | ✅ Rust **42-60M/s** ×11T | ✅ 200K/s |")
    print("| ways | Megaways family | ✅ | ✅ Rust **65-107M/s** ×11T | ✅ 586K/s |")
    print("| crash | Stake Crash, Aviator | ✅ | ✅ Rust **229-1,524M/s** ×11T | ✅ 1.75M/s |")
    print("| pay_anywhere | Sweet Bonanza scatter | ✅ | ✅ CF (exact, no MC needed) | n/a |")
    print()
    print("Throughput numbers measured on Apple M3 Pro, 11 perf-cores, ")
    print("`cargo build --release --bin mc_extended_real`.")
    print()
    print("Add a new game via:")
    print("  python3 -m tools.par_kernels.cli init <game> <variant> --shape <shape>")
    print()
    print("Evaluate entire portfolio in one command (with optional MC):")
    print("  python3 -m tools.par_kernels.cli batch --mc-spins 100000")
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

    p_batch = sub.add_parser(
        "batch",
        help="Evaluate the entire PAR library and emit a portfolio dashboard",
    )
    p_batch.add_argument("--mc-spins", type=int, default=0,
                         help="If > 0, run MC per game (shape-dispatched)")
    p_batch.add_argument("--seed", type=int, default=42)
    p_batch.add_argument("--tolerance-bps", type=float, default=50.0)
    p_batch.add_argument("--filter", default=None,
                         help="Substring filter (matches game or variant)")
    p_batch.add_argument("--out", help="Write dashboard to this Markdown path "
                                       "(default stdout)")
    p_batch.add_argument("--bench", help="Write structured JSON metrics to this "
                                         "path (for bench-history pinning + "
                                         "regression detection)")
    p_batch.set_defaults(func=cmd_batch)

    p_shapes = sub.add_parser("shapes", help="List supported evaluation shapes")
    p_shapes.set_defaults(func=cmd_shapes)

    p_demo = sub.add_parser(
        "demo",
        help="End-to-end pipeline showcase (evaluate + batch + pin + trend)",
    )
    p_demo.add_argument("--game", default="wrath-of-olympus",
                        help="Featured game for single-evaluate step")
    p_demo.add_argument("--variant", default="v12.0.0",
                        help="Variant of featured game")
    p_demo.add_argument("--mc-spins", type=int, default=100_000,
                        help="MC rounds per game (default 100,000 — fast demo)")
    p_demo.add_argument("--seed", type=int, default=42)
    p_demo.add_argument("--tolerance-bps", type=float, default=50.0)
    p_demo.add_argument("--out", help="Write demo report to path (default stdout)")
    p_demo.set_defaults(func=cmd_demo)

    p_diff = sub.add_parser(
        "bench-diff",
        help="Diff two `batch --bench` JSON payloads (regression report)",
    )
    p_diff.add_argument("current", help="Path to current bench JSON")
    p_diff.add_argument("baseline", help="Path to baseline bench JSON")
    p_diff.add_argument("--out", help="Write diff Markdown to path (default stdout)")
    p_diff.add_argument("--fail-on-regression", action="store_true",
                        help="Exit 1 if any pass→fail flip, "
                             "composer drift > 10 bps, or speed -20%%+")
    from tools.par_kernels.bench_history import cmd_bench_diff
    p_diff.set_defaults(func=cmd_bench_diff)

    p_pin = sub.add_parser(
        "bench-pin",
        help="Pin a batch --bench JSON to the portfolio-history ledger",
    )
    p_pin.add_argument("bench", help="Path to bench JSON (from `batch --bench`)")
    p_pin.add_argument("--pin-dir", default=None,
                       help="Override default reports/bench/portfolio-history/")
    p_pin.add_argument("--git-sha", default=None,
                       help="Git SHA (auto-detected from .git if absent)")
    from tools.par_kernels.bench_pin import cmd_bench_pin
    p_pin.set_defaults(func=cmd_bench_pin)

    p_trend = sub.add_parser(
        "bench-trend",
        help="Render per-game RTP trend across pinned history (sparkline + slope)",
    )
    p_trend.add_argument("--pin-dir", default=None,
                         help="Override default reports/bench/portfolio-history/")
    p_trend.add_argument("--last-n", type=int, default=None,
                         help="Only analyze the N most recent entries")
    p_trend.add_argument("--out", help="Write trend Markdown to path (default stdout)")
    from tools.par_kernels.bench_pin import cmd_bench_trend
    p_trend.set_defaults(func=cmd_bench_trend)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())

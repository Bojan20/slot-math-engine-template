"""SLOT-MATH Faza 3.1 — MC sweep orchestrator (Python wrapper around Rust hot-path).

Lifecycle:
  1. Load Game IR + canonical PAR
  2. Determine tier seeds (deterministic from game/variant)
  3. Spawn N parallel workers (Rust binary `par_mc` via subprocess OR
     pure-Python reference path for small tiers)
  4. Collect per-seed Welford aggregates
  5. Run compare_measured_to_par() against PAR targets
  6. Emit attestation + (optional) diff report
  7. Return (overall_pass, attestation_dict, diff_report_dict|None)
"""
from __future__ import annotations

import json
import platform
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from tools.par_mc_convergence.attestation import emit_attestation
from tools.par_mc_convergence.compare import (
    MeasuredMetrics,
    compare_measured_to_par,
)
from tools.par_mc_convergence.diff_report import generate_diff_report
from tools.par_mc_convergence.tiers import TIERS, Tier, tier_seeds


# ─── Worker abstraction ─────────────────────────────────────────────────
#
# Real path: Rust binary `target/release/par_mc` (Faza 3.1 next step).
# Reference path: Python kernel evaluator (slow but correct, used for
# unit tests and synthetic PAR validation).
#
# Worker signature:
#   fn(ir_dict, seed, spins) -> SeedResult
# ────────────────────────────────────────────────────────────────────────


@dataclass
class SeedResult:
    """Output of one seed's MC run."""
    seed: int
    spins: int
    total_won_x: float        # sum of all per-spin payouts (in base-bet units)
    hits: int                 # paying-spin count
    sum_sq_payout: float      # for variance reconstruction
    max_win_x: float
    p99_9_win_x: float
    feature_trigger_counts: dict[str, int]


@dataclass
class SweepResult:
    """Aggregate result from one tier sweep across all seeds."""
    overall_pass: bool
    measured: MeasuredMetrics
    attestation: dict[str, Any]
    diff_report: dict[str, Any] | None
    wallclock_seconds: float


def _python_reference_worker(
    ir: dict[str, Any], seed: int, spins: int
) -> SeedResult:
    """Reference Python worker for unit tests (deterministic synthetic MC).

    NOT a real kernel evaluator — used only to exercise the orchestrator
    plumbing and verify the gate logic. Real path uses Rust binary that
    invokes actual W244 kernel composition.
    """
    import random

    rng = random.Random(seed)
    target_rtp = ir.get("limits", {}).get("target_rtp", 0.96)
    target_hf = ir.get("limits", {}).get("hit_freq_target", 0.25)
    max_cap = ir.get("limits", {}).get("max_win_x", 5000.0)

    total_payout = 0.0
    hits = 0
    sum_sq = 0.0
    max_win = 0.0
    p99_9 = 0.0

    # Synthetic: bernoulli hit + lognormal payout calibrated to target_rtp
    # This is NOT how real kernel runs — only for orchestrator gate testing.
    for _ in range(spins):
        # Bernoulli hit
        if rng.random() < target_hf:
            hits += 1
            # Calibrated payout: mean ~ target_rtp / hit_freq
            mu = target_rtp / target_hf
            # Lognormal tail for realistic variance
            sigma = 1.2
            x = rng.lognormvariate(0.0, sigma)
            payout = min(max_cap, mu * x)
            total_payout += payout
            sum_sq += payout * payout
            if payout > max_win:
                max_win = payout
            if payout > p99_9:
                p99_9 = payout * 0.99  # synthetic estimate

    feature_counts: dict[str, int] = {}
    for feat in ir.get("features", []):
        kind = feat.get("kind", "unknown")
        # Synthetic trigger rate: 0.5% for any feature
        feature_counts[kind] = int(spins * 0.005)

    return SeedResult(
        seed=seed,
        spins=spins,
        total_won_x=total_payout,
        hits=hits,
        sum_sq_payout=sum_sq,
        max_win_x=max_win,
        p99_9_win_x=p99_9,
        feature_trigger_counts=feature_counts,
    )


def _aggregate_seed_results(
    results: list[SeedResult],
    tier: Tier,
) -> MeasuredMetrics:
    """Merge per-seed measurements into single MeasuredMetrics."""
    if not results:
        raise ValueError("no seed results to aggregate")

    total_spins = sum(r.spins for r in results)
    total_won = sum(r.total_won_x for r in results)
    total_hits = sum(r.hits for r in results)
    total_sq = sum(r.sum_sq_payout for r in results)
    max_win = max(r.max_win_x for r in results)
    p99_9 = max(r.p99_9_win_x for r in results)  # conservative

    rtp = total_won / total_spins if total_spins else 0.0
    hit_freq = total_hits / total_spins if total_spins else 0.0
    # Variance via E[X²] - (E[X])²
    e_x = rtp
    e_xx = total_sq / total_spins if total_spins else 0.0
    variance = e_xx - e_x * e_x

    per_seed_rtps = [
        r.total_won_x / r.spins if r.spins else 0.0 for r in results
    ]

    feature_counts: dict[str, int] = {}
    for r in results:
        for k, v in r.feature_trigger_counts.items():
            feature_counts[k] = feature_counts.get(k, 0) + v

    return MeasuredMetrics(
        tier=tier,
        total_spins=total_spins,
        seed_count=len(results),
        rtp=rtp,
        hits=total_hits,
        hit_freq=hit_freq,
        variance=variance,
        max_win_x=max_win,
        p99_9_win_x=p99_9,
        feature_trigger_counts=feature_counts,
        per_seed_rtps=per_seed_rtps,
    )


def run_sweep(
    ir: dict[str, Any],
    par: dict[str, Any],
    tier: Tier,
    worker: Callable[[dict[str, Any], int, int], SeedResult] | None = None,
    runtime_info_extra: dict[str, Any] | None = None,
) -> SweepResult:
    """Run MC convergence sweep at given tier.

    Args:
        ir: Game IR dict
        par: canonical PAR dict
        tier: tier enum (T1..T5)
        worker: per-seed worker function; defaults to Python reference
        runtime_info_extra: extra metadata to record in attestation

    Returns:
        SweepResult with overall_pass + attestation + (diff_report if fail)
    """
    worker = worker or _python_reference_worker
    config = TIERS[tier]
    game_id = ir.get("meta", {}).get("id", "unknown")
    variant_id = ir.get("provenance", {}).get("par_source", "unknown").rsplit("/", 1)[-1]
    seeds = tier_seeds(tier, game_id, variant_id)

    start = time.perf_counter()
    seed_results: list[SeedResult] = []
    for s in seeds:
        seed_results.append(worker(ir, s, config.spins_per_seed))
    wallclock = time.perf_counter() - start

    measured = _aggregate_seed_results(seed_results, tier)
    comparison = compare_measured_to_par(measured, par, tier)

    runtime_info = {
        "hostname": platform.node(),
        "cpu": platform.processor() or platform.machine(),
        "rust_version": "n/a (python reference worker)",
        "python_version": sys.version.split()[0],
        "wallclock_seconds": wallclock,
    }
    if runtime_info_extra:
        runtime_info.update(runtime_info_extra)

    par_merkle = par.get("merkle_root_sha256", "")
    ir_merkle = ir.get("provenance", {}).get("ir_sha256", "")

    attestation = emit_attestation(
        game_id=game_id,
        variant_id=variant_id,
        tier=tier,
        seeds=seeds,
        measured=measured,
        comparison=comparison,
        par_merkle=par_merkle,
        ir_merkle=ir_merkle,
        runtime_info=runtime_info,
    )

    diff_report = None
    if not comparison.overall_pass:
        diff_report = generate_diff_report(comparison, game_id, variant_id, par)

    return SweepResult(
        overall_pass=comparison.overall_pass,
        measured=measured,
        attestation=attestation,
        diff_report=diff_report,
        wallclock_seconds=wallclock,
    )


def write_sweep_artefacts(
    sweep: SweepResult,
    out_dir: Path,
) -> dict[str, Path]:
    """Write attestation JSON + (if fail) diff report MD to out_dir.

    Returns dict of artefact_kind → path.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: dict[str, Path] = {}

    att_path = out_dir / "mc_sweep.attestation.json"
    att_path.write_text(
        json.dumps(sweep.attestation, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    paths["attestation"] = att_path

    if sweep.diff_report:
        from tools.par_mc_convergence.diff_report import diff_report_to_markdown

        diff_md = diff_report_to_markdown(sweep.diff_report)
        diff_path = out_dir / "mc_diff_report.md"
        diff_path.write_text(diff_md, encoding="utf-8")
        paths["diff_report"] = diff_path

    return paths

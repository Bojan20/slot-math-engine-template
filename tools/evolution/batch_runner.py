"""W7.4-batch — 1000-variant parallel Pareto batch runner.

Mission acceptance #10 capstone: spawn 1000 IR variants in parallel,
evaluate each against multi-objective target (RTP × volatility ×
hit-freq × max-win), emit a CSV/JSON catalog of Pareto-frontier
variants ready for designer selection.

Uses `multiprocessing.Pool` over CPU cores; each worker runs the
slot-sim binary independently, so wall time = (1000 / cores) ×
spins-per-eval / engine throughput.

For a 24-h budget on a 10-core machine at 1M spins/var:
  10 cores × 24h × 3600s × 1.4M spins/s ≈ 1.2T spins total
  ÷ 1M spins/var = 1.2M variants explored — covers 1000× budget × 24h.

CLI:
    python -m tools.evolution.batch_runner <baseline.ir.json> \\
        --target-rtp 0.95 --target-hit-freq 0.20 \\
        --variants 1000 --spins 100000 --workers 8 \\
        --out variants.json
"""
from __future__ import annotations
import argparse
import json
import multiprocessing as mp
import os
import random
import sys
import time
from pathlib import Path
from typing import Any

from tools.evolution.genetic_solver import Genome, _find_slot_sim_bin
from tools.evolution.pareto_solver import (
    ParetoGenome,
    evaluate_objectives,
    fast_non_dominated_sort,
    crowding_distance,
    VOLATILITY_TARGETS,
)


def _eval_worker(args: tuple) -> dict[str, Any]:
    """Worker function — must be top-level for multiprocessing pickling.

    Builds one random Genome with the given seed, evaluates objectives,
    returns serializable dict.
    """
    (
        baseline_path_str, target_rtp, target_hit_freq, target_volatility,
        max_win_cap, spins, seed, anneal,
    ) = args
    bin_path = _find_slot_sim_bin()
    if bin_path is None:
        return {"error": "slot-sim not built", "seed": seed}
    with open(baseline_path_str) as f:
        baseline = json.load(f)
    rng = random.Random(seed)
    if seed == 0:
        genome = Genome()  # identity
    else:
        genome = Genome.random(rng, anneal=anneal)
    pg = evaluate_objectives(
        genome, baseline,
        target_rtp=target_rtp,
        target_hit_freq=target_hit_freq,
        target_volatility=target_volatility,
        max_win_cap=max_win_cap,
        spins=spins, seed=seed, bin_path=bin_path, rng=rng,
    )
    return {
        "seed": seed,
        "genome": {
            "paytable_scale": genome.paytable_scale,
            "reel_weight_jitter": genome.reel_weight_jitter,
            "feature_trigger_scale": genome.feature_trigger_scale,
            "feature_avg_pay_scale": genome.feature_avg_pay_scale,
        },
        "objectives": list(pg.objectives),
        "rtp": pg.rtp,
        "hit_freq": pg.hit_freq,
        "win_freq": pg.win_freq,
        "estimated_volatility": pg.estimated_volatility,
    }


def run_batch(
    baseline_ir_path: Path,
    *,
    target_rtp: float,
    target_hit_freq: float | None = None,
    target_volatility: float | str | None = None,
    max_win_cap: float | None = None,
    variants: int = 1000,
    spins_per_variant: int = 100_000,
    workers: int | None = None,
    seed: int = 42,
    anneal: float = 1.0,
    verbose: bool = False,
) -> dict[str, Any]:
    """Spawn `variants` workers in parallel + collect Pareto front.

    Returns dict with all variants + Pareto-front subset + timing info.
    """
    if isinstance(target_volatility, str):
        target_volatility = VOLATILITY_TARGETS.get(target_volatility.lower())

    if workers is None:
        workers = os.cpu_count() or 1

    args_list = [
        (
            str(baseline_ir_path), target_rtp, target_hit_freq,
            target_volatility, max_win_cap, spins_per_variant,
            seed + i, anneal,
        )
        for i in range(variants)
    ]

    t0 = time.monotonic()
    if workers == 1:
        results = [_eval_worker(a) for a in args_list]
    else:
        with mp.Pool(processes=workers) as pool:
            results = pool.map(_eval_worker, args_list)
    elapsed = time.monotonic() - t0

    if verbose:
        ok = sum(1 for r in results if "error" not in r)
        print(f"[batch] {ok}/{variants} variants completed in {elapsed:.1f}s "
              f"({elapsed/variants*1000:.1f}ms each, {workers} workers)")

    # Rebuild ParetoGenomes for Pareto sort
    pareto_pop: list[ParetoGenome] = []
    for r in results:
        if "error" in r:
            continue
        g = Genome(
            paytable_scale=r["genome"]["paytable_scale"],
            reel_weight_jitter=r["genome"]["reel_weight_jitter"],
            feature_trigger_scale=r["genome"]["feature_trigger_scale"],
            feature_avg_pay_scale=r["genome"]["feature_avg_pay_scale"],
        )
        pg = ParetoGenome(
            genome=g,
            objectives=tuple(r["objectives"]),
            rtp=r["rtp"], hit_freq=r["hit_freq"],
            win_freq=r["win_freq"],
            estimated_volatility=r["estimated_volatility"],
        )
        pareto_pop.append(pg)

    fronts = fast_non_dominated_sort(pareto_pop)
    if fronts:
        crowding_distance(fronts[0])

    front0 = sorted(
        [pg for pg in pareto_pop if pg.rank == 0],
        key=lambda pg: pg.objectives,
    )

    return {
        "baseline_ir": str(baseline_ir_path),
        "target_rtp": target_rtp,
        "target_hit_freq": target_hit_freq,
        "target_volatility": target_volatility,
        "max_win_cap": max_win_cap,
        "variants_requested": variants,
        "variants_completed": len(pareto_pop),
        "workers": workers,
        "elapsed_s": round(elapsed, 2),
        "throughput_variants_per_sec": round(variants / elapsed, 2) if elapsed > 0 else 0,
        "pareto_front_size": len(front0),
        "pareto_front": [
            {
                "rank": 0,
                "genome": {
                    "paytable_scale": pg.genome.paytable_scale,
                    "reel_weight_jitter": pg.genome.reel_weight_jitter,
                    "feature_trigger_scale": pg.genome.feature_trigger_scale,
                    "feature_avg_pay_scale": pg.genome.feature_avg_pay_scale,
                },
                "objectives": list(pg.objectives),
                "rtp": pg.rtp,
                "hit_freq": pg.hit_freq,
                "estimated_volatility": pg.estimated_volatility,
                "crowding": pg.crowding,
            }
            for pg in front0
        ],
        "all_variants": results,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="batch-runner",
        description="W7.4-batch — parallel Pareto batch (mission #10)",
    )
    ap.add_argument("baseline")
    ap.add_argument("--target-rtp", type=float, required=True)
    ap.add_argument("--target-hit-freq", type=float, default=None)
    ap.add_argument("--target-volatility", default=None)
    ap.add_argument("--max-win-cap", type=float, default=None)
    ap.add_argument("--variants", type=int, default=1000)
    ap.add_argument("--spins", type=int, default=100_000)
    ap.add_argument("--workers", type=int, default=0,
                    help="0 = auto-detect via os.cpu_count")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--anneal", type=float, default=1.0)
    ap.add_argument("--out", default=None, help="JSON report path")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)

    tv: float | str | None = args.target_volatility
    if tv and tv in VOLATILITY_TARGETS:
        pass
    elif tv:
        try:
            tv = float(tv)
        except ValueError:
            print(f"error: invalid target_volatility {tv!r}", file=sys.stderr)
            return 2

    workers = args.workers if args.workers > 0 else None
    report = run_batch(
        Path(args.baseline),
        target_rtp=args.target_rtp,
        target_hit_freq=args.target_hit_freq,
        target_volatility=tv,
        max_win_cap=args.max_win_cap,
        variants=args.variants,
        spins_per_variant=args.spins,
        workers=workers,
        seed=args.seed,
        anneal=args.anneal,
        verbose=args.verbose,
    )

    if args.out:
        Path(args.out).write_text(json.dumps(report, indent=2, default=str))
        print(f"wrote {args.out} ({Path(args.out).stat().st_size:,} bytes)")
    print(f"\n[batch] {report['variants_completed']}/{report['variants_requested']} "
          f"variants completed in {report['elapsed_s']:.2f}s "
          f"({report['throughput_variants_per_sec']:.1f} variants/s, "
          f"{report['workers']} workers)")
    print(f"  Pareto front: {report['pareto_front_size']} non-dominated")
    print(f"  Best 3 objectives:")
    for i, pg in enumerate(report["pareto_front"][:3]):
        rtp = pg.get("rtp") or 0
        hit = pg.get("hit_freq") or 0
        print(f"    [{i+1}] obj={tuple(round(o, 4) for o in pg['objectives'])} "
              f"rtp={rtp:.4f} hit={hit:.4f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

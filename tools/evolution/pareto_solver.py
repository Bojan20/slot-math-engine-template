"""W7.4 — Multi-objective Pareto solver.

Extends W7.1's μ+λ ES with **multi-objective NSGA-II-style** selection.
Designer supplies an objective profile (target RTP, target volatility
class, target hit-freq, max-win cap), and the solver produces a
**Pareto-front** of genomes that trade off these objectives — no
single "best" but a frontier of non-dominated candidates.

Objectives (all minimized; smaller = better):

  ▸ rtp_gap        = |rtp - target_rtp|
  ▸ hit_freq_gap   = |hit_freq - target_hit_freq|
  ▸ volatility_gap = |measured_volatility - target_volatility|
                     where measured_volatility ≈ stddev of single-spin
                     payouts normalized by mean
  ▸ max_win_penalty = max(0, observed_max_win - max_win_cap)

NSGA-II selection (simplified):

  1. Rank all genomes by Pareto dominance (front 1 = non-dominated,
     front 2 = dominated only by front 1, …)
  2. Within same front, prefer higher crowding distance (diversity)
  3. Keep top μ; spawn λ children via mutation

Industry-first per Kimi research: no commercial slot studio publishes
multi-objective Pareto math optimizer. SMT/Z3 alternative (W7.3)
deferred.

CLI:
    python -m tools.evolution.pareto_solver <baseline.ir.json> \\
        --target-rtp 0.95 --target-hit-freq 0.25 \\
        --target-volatility medium --max-win-cap 5000 \\
        --population 12 --generations 15 --spins 15000
"""
from __future__ import annotations
import argparse
import copy
import json
import math
import random
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tools.evolution.genetic_solver import Genome, _measure_rtp, _find_slot_sim_bin


# Target volatility class → numeric stddev / mean ratio target
VOLATILITY_TARGETS = {
    "low":      2.0,   # tight payout distribution
    "medium":   5.0,
    "high":     12.0,
    "ultra":    25.0,  # huge variance, rare big wins
}


# ─── multi-objective genome ─────────────────────────────────────────────────


@dataclass
class ParetoGenome:
    """Genome with N-dimensional objective vector."""

    genome: Genome
    objectives: tuple[float, ...] = field(default_factory=tuple)
    rank: int = 0  # Pareto front index (0 = front 1, 1 = front 2, …)
    crowding: float = 0.0  # NSGA-II crowding distance

    # Metrics captured for diagnostics
    rtp: float | None = None
    hit_freq: float | None = None
    win_freq: float | None = None
    estimated_volatility: float | None = None


def dominates(a: ParetoGenome, b: ParetoGenome) -> bool:
    """Pareto-dominance: a dominates b iff a is ≤ on every objective and
    strictly < on at least one (minimization)."""
    if len(a.objectives) != len(b.objectives):
        return False
    if len(a.objectives) == 0:
        return False
    strict = False
    for ai, bi in zip(a.objectives, b.objectives):
        if ai > bi:
            return False
        if ai < bi:
            strict = True
    return strict


def fast_non_dominated_sort(population: list[ParetoGenome]) -> list[list[ParetoGenome]]:
    """NSGA-II fast non-dominated sort.

    Returns list of fronts: fronts[0] = non-dominated genomes, fronts[1]
    = dominated only by fronts[0], etc. Each genome's `.rank` is filled.
    """
    fronts: list[list[ParetoGenome]] = [[]]
    dominated_by: dict[int, list[int]] = {i: [] for i in range(len(population))}
    domination_count: dict[int, int] = {i: 0 for i in range(len(population))}

    for i, p in enumerate(population):
        for j, q in enumerate(population):
            if i == j:
                continue
            if dominates(p, q):
                dominated_by[i].append(j)
            elif dominates(q, p):
                domination_count[i] += 1
        if domination_count[i] == 0:
            p.rank = 0
            fronts[0].append(p)

    front_idx = 0
    while fronts[front_idx]:
        next_front: list[ParetoGenome] = []
        for p in fronts[front_idx]:
            pi = population.index(p)
            for qi in dominated_by[pi]:
                domination_count[qi] -= 1
                if domination_count[qi] == 0:
                    population[qi].rank = front_idx + 1
                    next_front.append(population[qi])
        fronts.append(next_front)
        front_idx += 1

    if not fronts[-1]:
        fronts.pop()
    return fronts


def crowding_distance(front: list[ParetoGenome]) -> None:
    """Assign NSGA-II crowding distance to each genome in `front`."""
    n = len(front)
    if n == 0:
        return
    for g in front:
        g.crowding = 0.0
    n_obj = len(front[0].objectives) if front[0].objectives else 0
    for m in range(n_obj):
        front.sort(key=lambda g: g.objectives[m])
        front[0].crowding = math.inf
        front[-1].crowding = math.inf
        if n <= 2:
            continue
        obj_min = front[0].objectives[m]
        obj_max = front[-1].objectives[m]
        spread = obj_max - obj_min if obj_max > obj_min else 1.0
        for i in range(1, n - 1):
            front[i].crowding += (
                front[i + 1].objectives[m] - front[i - 1].objectives[m]
            ) / spread


def crowded_compare(a: ParetoGenome, b: ParetoGenome) -> int:
    """NSGA-II crowded comparison: lower rank wins; same rank → higher
    crowding wins. Returns -1 if a is preferred, +1 if b, 0 if equal."""
    if a.rank < b.rank:
        return -1
    if a.rank > b.rank:
        return 1
    if a.crowding > b.crowding:
        return -1
    if a.crowding < b.crowding:
        return 1
    return 0


# ─── objective evaluator ────────────────────────────────────────────────────


def _measure_with_volatility(
    ir: dict, spins: int, seed: int, bin_path: Path,
) -> dict[str, float]:
    """Run engine + parse RTP, hit, win, max_spin → estimate volatility."""
    with tempfile.NamedTemporaryFile(
        suffix=".slot-sim.ir.json", mode="w", delete=False,
    ) as f:
        json.dump(ir, f)
        tmp_path = f.name
    try:
        cmd = [
            str(bin_path),
            "--ir", tmp_path,
            "--spins", str(spins),
            "--bet-mult", "1",
            "--seed", str(seed),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if proc.returncode != 0:
            return {"rtp": float("nan")}
        out: dict[str, float] = {}
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("RTP:"):
                out["rtp"] = float(line.split("(")[0].split()[1])
            elif line.startswith("Hit freq:"):
                out["hit_freq"] = float(line.split("(")[0].split()[2])
            elif line.startswith("Win freq:"):
                out["win_freq"] = float(line.split("(")[0].split()[2])
            elif line.startswith("Max spin:"):
                out["max_spin"] = float(line.split()[2].rstrip("×"))
        # Estimate volatility as max_spin / mean_spin (= max_spin / RTP);
        # crude but monotonic with actual stddev for typical slot families.
        rtp = out.get("rtp", 0.0)
        max_spin = out.get("max_spin", 0.0)
        out["volatility"] = max_spin / max(rtp, 0.001)
        return out
    finally:
        try:
            import os as _os
            _os.unlink(tmp_path)
        except OSError:
            pass


def evaluate_objectives(
    genome: Genome,
    baseline: dict,
    *,
    target_rtp: float,
    target_hit_freq: float | None,
    target_volatility: float | None,
    max_win_cap: float | None,
    spins: int,
    seed: int,
    bin_path: Path,
    rng: random.Random,
) -> ParetoGenome:
    """Apply genome → run engine → compute objective vector."""
    perturbed = genome.apply(baseline, rng)
    m = _measure_with_volatility(perturbed, spins, seed, bin_path)

    rtp = m.get("rtp")
    hit = m.get("hit_freq")
    vol = m.get("volatility")
    max_spin = m.get("max_spin", 0.0)

    objectives: list[float] = []
    objectives.append(
        abs(rtp - target_rtp) if rtp is not None and not math.isnan(rtp) else float("inf")
    )
    if target_hit_freq is not None:
        objectives.append(
            abs(hit - target_hit_freq)
            if hit is not None and not math.isnan(hit) else float("inf")
        )
    if target_volatility is not None:
        objectives.append(
            abs(vol - target_volatility)
            if vol is not None and not math.isnan(vol) else float("inf")
        )
    if max_win_cap is not None:
        objectives.append(max(0.0, max_spin - max_win_cap))

    return ParetoGenome(
        genome=genome,
        objectives=tuple(objectives),
        rtp=rtp,
        hit_freq=hit,
        win_freq=m.get("win_freq"),
        estimated_volatility=vol,
    )


# ─── NSGA-II driver ─────────────────────────────────────────────────────────


def evolve_pareto(
    baseline_ir_path: Path,
    *,
    target_rtp: float,
    target_hit_freq: float | None = None,
    target_volatility: float | str | None = None,
    max_win_cap: float | None = None,
    population: int = 12,
    generations: int = 15,
    spins_per_eval: int = 15_000,
    seed: int = 42,
    bin_path: Path | None = None,
    verbose: bool = False,
) -> dict[str, Any]:
    if bin_path is None:
        bin_path = _find_slot_sim_bin()
    if bin_path is None:
        raise FileNotFoundError("slot-sim binary not built")

    if isinstance(target_volatility, str):
        target_volatility = VOLATILITY_TARGETS.get(target_volatility.lower())

    with open(baseline_ir_path) as f:
        baseline = json.load(f)

    rng = random.Random(seed)
    # Seed initial population
    pop: list[ParetoGenome] = []
    pop.append(evaluate_objectives(
        Genome(), baseline,
        target_rtp=target_rtp, target_hit_freq=target_hit_freq,
        target_volatility=target_volatility, max_win_cap=max_win_cap,
        spins=spins_per_eval, seed=seed, bin_path=bin_path, rng=rng,
    ))
    for _ in range(population - 1):
        g = Genome.random(rng, anneal=1.0)
        pop.append(evaluate_objectives(
            g, baseline,
            target_rtp=target_rtp, target_hit_freq=target_hit_freq,
            target_volatility=target_volatility, max_win_cap=max_win_cap,
            spins=spins_per_eval, seed=seed, bin_path=bin_path, rng=rng,
        ))

    fronts = fast_non_dominated_sort(pop)
    for front in fronts:
        crowding_distance(front)

    history: list[dict[str, Any]] = []
    for gen in range(generations):
        t0 = time.monotonic()

        # Spawn λ children via tournament + mutation
        offspring: list[ParetoGenome] = []
        anneal = max(0.1, 1.0 / (1 + gen))  # shrink noise over generations
        while len(offspring) < population:
            a, b = rng.sample(pop, 2)
            winner = a if crowded_compare(a, b) <= 0 else b
            child_g = winner.genome.mutate(rng, anneal=anneal)
            child = evaluate_objectives(
                child_g, baseline,
                target_rtp=target_rtp, target_hit_freq=target_hit_freq,
                target_volatility=target_volatility, max_win_cap=max_win_cap,
                spins=spins_per_eval, seed=seed + gen + 1, bin_path=bin_path,
                rng=rng,
            )
            offspring.append(child)

        # Combined population + non-dominated sort
        combined = pop + offspring
        fronts = fast_non_dominated_sort(combined)
        new_pop: list[ParetoGenome] = []
        for front in fronts:
            crowding_distance(front)
            if len(new_pop) + len(front) <= population:
                new_pop.extend(front)
            else:
                # Sort by crowding distance descending; take what fits
                front.sort(key=lambda g: -g.crowding)
                new_pop.extend(front[: population - len(new_pop)])
                break
        pop = new_pop

        # Best-on-front-0 summary
        front0 = [g for g in pop if g.rank == 0]
        if verbose:
            best_obj = tuple(round(o, 4) for o in front0[0].objectives) if front0 else ()
            elapsed = time.monotonic() - t0
            print(
                f"[gen {gen+1:>2}/{generations}] front0_size={len(front0)} "
                f"best_obj={best_obj}  ({elapsed:.1f}s)"
            )
        history.append({
            "generation": gen,
            "front0_size": len(front0),
            "elapsed_s": time.monotonic() - t0,
        })

    final_front0 = sorted([g for g in pop if g.rank == 0],
                          key=lambda g: g.objectives)
    return {
        "pareto_front": final_front0,
        "all_genomes": pop,
        "generations_log": history,
        "target_rtp": target_rtp,
        "target_hit_freq": target_hit_freq,
        "target_volatility": target_volatility,
        "max_win_cap": max_win_cap,
        "generations_run": len(history),
    }


# ─── CLI ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="pareto-solver", description="W7.4 multi-objective NSGA-II"
    )
    ap.add_argument("baseline", help="baseline *.slot-sim.ir.json")
    ap.add_argument("--target-rtp", type=float, required=True)
    ap.add_argument("--target-hit-freq", type=float, default=None)
    ap.add_argument(
        "--target-volatility", default=None,
        help="low | medium | high | ultra | numeric ratio",
    )
    ap.add_argument("--max-win-cap", type=float, default=None,
                    help="penalty if max single-spin × > this cap")
    ap.add_argument("--population", type=int, default=12)
    ap.add_argument("--generations", type=int, default=15)
    ap.add_argument("--spins", type=int, default=15_000)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)

    # Parse volatility
    tv: float | str | None = args.target_volatility
    if tv and tv.lower() in VOLATILITY_TARGETS:
        tv = tv.lower()
    elif tv:
        try:
            tv = float(tv)
        except ValueError:
            print(f"error: invalid target_volatility {tv!r}", file=sys.stderr)
            return 2

    result = evolve_pareto(
        Path(args.baseline),
        target_rtp=args.target_rtp,
        target_hit_freq=args.target_hit_freq,
        target_volatility=tv,
        max_win_cap=args.max_win_cap,
        population=args.population, generations=args.generations,
        spins_per_eval=args.spins, seed=args.seed, verbose=args.verbose,
    )

    print()
    print(f"  baseline:     {args.baseline}")
    print(f"  target RTP:   {args.target_rtp}")
    if args.target_hit_freq is not None:
        print(f"  target hit:   {args.target_hit_freq}")
    if tv is not None:
        print(f"  target vol:   {tv}")
    if args.max_win_cap is not None:
        print(f"  max win cap:  {args.max_win_cap}")
    print(f"  generations:  {result['generations_run']}")
    front = result["pareto_front"]
    print(f"\n  Pareto front ({len(front)} non-dominated genomes):")
    for i, g in enumerate(front[:10]):
        rtp_s = f"{g.rtp:.4f}" if g.rtp is not None else "n/a"
        hit_s = f"{g.hit_freq:.4f}" if g.hit_freq is not None else "n/a"
        vol_s = f"{g.estimated_volatility:.2f}" if g.estimated_volatility is not None else "n/a"
        obj_s = tuple(round(o, 4) for o in g.objectives)
        print(f"    [{i+1}] obj={obj_s} rtp={rtp_s} hit={hit_s} vol={vol_s}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

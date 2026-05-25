"""W7.1 — Genetic solver for IR → RTP target fit.

Population-based evolutionary algorithm that perturbs reel weights +
paytable pays + feature trigger probabilities to drive engine MC RTP
toward a designer-supplied target.

Algorithm (textbook μ+λ-ES with mutation only — no crossover yet):

  1. Generate `population` IR variants from baseline via random
     perturbations.
  2. Evaluate each variant's RTP via short MC run (`spins_per_eval`).
  3. Sort by |RTP - target_rtp|; keep top half.
  4. Spawn children from top-half by adding noise scaled by current
     best gap (anneal: less noise as gap closes).
  5. Repeat for `generations` iterations.

Returns:

  Best variant (lowest gap to target), all generation logs, and
  optional final IR JSON write.

CLI:

    python -m tools.evolution.genetic_solver \\
        <baseline.slot-sim.ir.json> \\
        --target-rtp 0.95 \\
        --population 10 --generations 20 --spins 20000 \\
        --out best.ir.json
"""
from __future__ import annotations
import argparse
import copy
import json
import math
import os
import random
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent.parent


# ─── engine runner ──────────────────────────────────────────────────────────


def _find_slot_sim_bin() -> Path | None:
    env = os.environ.get("SLOT_SIM_BIN")
    if env and Path(env).exists():
        return Path(env)
    p = ROOT / "engine/slot-sim/target/release/slot-sim"
    return p if p.exists() else None


def _measure_rtp(ir: dict, spins: int, seed: int, bin_path: Path) -> dict[str, float]:
    """Run engine on an in-memory IR + parse RTP, hit, win out of stdout."""
    with tempfile.NamedTemporaryFile(
        suffix=".slot-sim.ir.json", mode="w", delete=False
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
            return {"rtp": float("nan"), "hit_freq": float("nan"), "win_freq": float("nan")}
        out: dict[str, float] = {}
        for line in proc.stdout.splitlines():
            line = line.strip()
            if line.startswith("RTP:"):
                out["rtp"] = float(line.split("(")[0].split()[1])
            elif line.startswith("Hit freq:"):
                out["hit_freq"] = float(line.split("(")[0].split()[2])
            elif line.startswith("Win freq:"):
                out["win_freq"] = float(line.split("(")[0].split()[2])
        return out
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ─── Genome — encoded perturbation of a baseline IR ─────────────────────────


@dataclass
class Genome:
    """Genome stores the perturbation deltas — applied to baseline to
    produce a candidate IR."""

    paytable_scale: float = 1.0
    """Multiplier applied to every paytable `pays` value (including
    fs_paytable). Default 1.0 = no scaling. Bounded to [0.5, 2.0] to
    avoid pathological pay tables."""

    reel_weight_jitter: float = 0.0
    """Per-stop weight jitter magnitude (multiplicative noise). For
    each stop in each reel, weight = original × (1 + uniform(-j, j)).
    Preserves symbol identity; perturbs distribution. Bounded [0, 0.5]."""

    feature_trigger_scale: float = 1.0
    """Multiplier on Feature::HoldAndWin.trigger_prob and
    Feature::PickBonus.trigger_prob. Bounded [0.1, 5.0]."""

    feature_avg_pay_scale: float = 1.0
    """Multiplier on Feature::HoldAndWin.avg_pay_per_trigger. Bounded
    [0.5, 2.0]."""

    # Filled in by evaluator
    rtp: float | None = field(default=None, repr=False)
    hit_freq: float | None = field(default=None, repr=False)
    win_freq: float | None = field(default=None, repr=False)
    gap_to_target: float | None = field(default=None, repr=False)

    @classmethod
    def random(cls, rng: random.Random, *, anneal: float = 1.0) -> "Genome":
        """Generate a random genome. `anneal` ∈ [0, 1] scales the
        perturbation magnitude — 1.0 = full search, 0.1 = fine tuning."""
        return cls(
            paytable_scale=1.0 + rng.uniform(-0.5, 0.5) * anneal,
            reel_weight_jitter=abs(rng.uniform(0.0, 0.3)) * anneal,
            feature_trigger_scale=math.exp(rng.uniform(-1.5, 1.5) * anneal),
            feature_avg_pay_scale=1.0 + rng.uniform(-0.4, 0.4) * anneal,
        )

    def mutate(self, rng: random.Random, anneal: float = 0.3) -> "Genome":
        """Return a perturbed copy. `anneal` scales noise magnitude."""
        return Genome(
            paytable_scale=max(0.5, min(2.0,
                self.paytable_scale * math.exp(rng.uniform(-0.3, 0.3) * anneal))),
            reel_weight_jitter=max(0.0, min(0.5,
                self.reel_weight_jitter + rng.uniform(-0.1, 0.1) * anneal)),
            feature_trigger_scale=max(0.1, min(5.0,
                self.feature_trigger_scale * math.exp(rng.uniform(-0.6, 0.6) * anneal))),
            feature_avg_pay_scale=max(0.5, min(2.0,
                self.feature_avg_pay_scale * math.exp(rng.uniform(-0.3, 0.3) * anneal))),
        )

    def apply(self, baseline: dict, rng: random.Random) -> dict:
        """Apply this genome to a baseline IR and return the perturbed copy."""
        new_ir = copy.deepcopy(baseline)

        # 1. Scale paytable
        for entry in new_ir.get("paytable") or []:
            if isinstance(entry.get("pays"), (int, float)):
                entry["pays"] = float(entry["pays"]) * self.paytable_scale
        for f in new_ir.get("features") or []:
            if f.get("kind") == "free_spins":
                for fpt in f.get("fs_paytable") or []:
                    if isinstance(fpt.get("pays"), (int, float)):
                        fpt["pays"] = float(fpt["pays"]) * self.paytable_scale

        # 2. Jitter reel weights
        if self.reel_weight_jitter > 0:
            for rs in new_ir.get("reels", {}).get("base") or []:
                for reel in rs.get("reels") or []:
                    for stop in reel:
                        if isinstance(stop.get("weight"), (int, float)):
                            j = 1.0 + rng.uniform(
                                -self.reel_weight_jitter, self.reel_weight_jitter
                            )
                            stop["weight"] = max(1, int(stop["weight"] * j))

        # 3. Scale feature trigger probabilities + avg pays
        for f in new_ir.get("features") or []:
            kind = f.get("kind")
            if kind in ("hold_and_win", "pick_bonus"):
                if isinstance(f.get("trigger_prob"), (int, float)):
                    f["trigger_prob"] = max(0.0, min(1.0,
                        f["trigger_prob"] * self.feature_trigger_scale))
            if kind == "hold_and_win" and isinstance(
                f.get("avg_pay_per_trigger"), (int, float)
            ):
                f["avg_pay_per_trigger"] = (
                    f["avg_pay_per_trigger"] * self.feature_avg_pay_scale
                )

        return new_ir


# ─── Population evolution ───────────────────────────────────────────────────


@dataclass
class Population:
    """One generation of candidate genomes."""
    generation: int
    genomes: list[Genome]
    best_gap: float
    best_rtp: float
    elapsed_s: float


def _evaluate(
    genome: Genome,
    baseline: dict,
    target_rtp: float,
    spins: int,
    seed: int,
    bin_path: Path,
    rng: random.Random,
) -> Genome:
    """Apply genome → run engine → fill in genome.rtp + gap_to_target."""
    perturbed = genome.apply(baseline, rng)
    metrics = _measure_rtp(perturbed, spins, seed, bin_path)
    genome.rtp = metrics.get("rtp")
    genome.hit_freq = metrics.get("hit_freq")
    genome.win_freq = metrics.get("win_freq")
    if genome.rtp is not None and not math.isnan(genome.rtp):
        genome.gap_to_target = abs(genome.rtp - target_rtp)
    else:
        genome.gap_to_target = float("inf")
    return genome


def evolve_to_target(
    baseline_ir_path: Path,
    *,
    target_rtp: float,
    population: int = 10,
    generations: int = 20,
    spins_per_eval: int = 20_000,
    seed: int = 42,
    convergence_tol: float = 0.001,
    bin_path: Path | None = None,
    verbose: bool = False,
) -> dict[str, Any]:
    """Run μ+λ evolution to fit `target_rtp`.

    Returns dict with:
      best_genome      — Genome with lowest |RTP - target|
      best_ir          — perturbed IR JSON dict for the best genome
      generations_log  — list of Population objects
      converged        — True if any genome got within `convergence_tol`
      target_rtp       — the target value
    """
    if bin_path is None:
        bin_path = _find_slot_sim_bin()
    if bin_path is None:
        raise FileNotFoundError(
            "slot-sim binary not found. Build with `cargo build --release` "
            "in engine/slot-sim/, or set $SLOT_SIM_BIN."
        )

    with open(baseline_ir_path) as f:
        baseline = json.load(f)

    rng = random.Random(seed)
    # Seed initial population: identity genome + N-1 random ones
    genomes: list[Genome] = [Genome()]
    for _ in range(population - 1):
        genomes.append(Genome.random(rng, anneal=1.0))

    history: list[Population] = []
    best: Genome | None = None
    converged = False

    for gen in range(generations):
        t0 = time.monotonic()
        # Evaluate each genome — use the SAME seed per genome so RTP
        # comparison is fair; vary only across generations
        eval_seed = seed + gen * 1000
        for i, g in enumerate(genomes):
            if g.gap_to_target is None:  # not yet evaluated
                _evaluate(g, baseline, target_rtp, spins_per_eval,
                          eval_seed + i, bin_path, random.Random(eval_seed + i))

        # Sort by gap; replace nan with inf
        genomes.sort(key=lambda g: g.gap_to_target or float("inf"))
        best = genomes[0]
        best_gap = best.gap_to_target or float("inf")
        best_rtp = best.rtp if best.rtp is not None else float("nan")
        elapsed = time.monotonic() - t0
        history.append(Population(
            generation=gen, genomes=list(genomes),
            best_gap=best_gap, best_rtp=best_rtp, elapsed_s=elapsed,
        ))

        if verbose:
            print(
                f"[gen {gen+1:>3}/{generations}] best gap={best_gap:.5f} "
                f"rtp={best_rtp:.5f} target={target_rtp:.5f}  ({elapsed:.1f}s)"
            )

        if best_gap < convergence_tol:
            converged = True
            if verbose:
                print(f"✅ converged at gen {gen+1}")
            break

        # Spawn next generation: keep top half, mutate each → child
        half = max(1, population // 2)
        parents = genomes[:half]
        # Anneal: less noise as gap closes
        anneal = max(0.05, min(1.0, best_gap * 10.0))
        children: list[Genome] = []
        while len(parents) + len(children) < population:
            parent = rng.choice(parents)
            children.append(parent.mutate(rng, anneal=anneal))
        genomes = parents + children
        # Reset evaluation state for children only
        for g in children:
            g.rtp = None
            g.hit_freq = None
            g.win_freq = None
            g.gap_to_target = None

    if best is None:
        raise RuntimeError("evolution produced no genomes")
    best_ir = best.apply(baseline, random.Random(seed))
    return {
        "best_genome": best,
        "best_ir": best_ir,
        "generations_log": history,
        "converged": converged,
        "target_rtp": target_rtp,
        "final_rtp": best.rtp,
        "final_gap": best.gap_to_target,
        "generations_run": len(history),
    }


# ─── CLI ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="genetic-solver",
                                  description="W7.1 evolutionary IR → RTP fit")
    ap.add_argument("baseline", help="path to baseline *.slot-sim.ir.json")
    ap.add_argument("--target-rtp", type=float, required=True,
                    help="target RTP (e.g. 0.95)")
    ap.add_argument("--population", type=int, default=10)
    ap.add_argument("--generations", type=int, default=20)
    ap.add_argument("--spins", type=int, default=20_000,
                    help="spins per evaluation (default 20K)")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--convergence-tol", type=float, default=0.001,
                    help="abort early when best gap < this (default 0.001 = 0.1 pct RTP)")
    ap.add_argument("--out", default=None,
                    help="write best evolved IR to this path")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args(argv)

    result = evolve_to_target(
        Path(args.baseline),
        target_rtp=args.target_rtp,
        population=args.population,
        generations=args.generations,
        spins_per_eval=args.spins,
        seed=args.seed,
        convergence_tol=args.convergence_tol,
        verbose=args.verbose,
    )

    best = result["best_genome"]
    print()
    print(f"  baseline:    {args.baseline}")
    print(f"  target RTP:  {result['target_rtp']:.5f}")
    print(f"  final RTP:   {result['final_rtp']:.5f}")
    print(f"  final gap:   {result['final_gap']:.5f}")
    print(f"  converged:   {result['converged']}")
    print(f"  generations: {result['generations_run']}")
    print(f"  best genome: paytable_scale={best.paytable_scale:.4f}, "
          f"reel_jitter={best.reel_weight_jitter:.4f}, "
          f"trigger_scale={best.feature_trigger_scale:.4f}, "
          f"avg_pay_scale={best.feature_avg_pay_scale:.4f}")

    if args.out:
        Path(args.out).write_text(
            json.dumps(result["best_ir"], indent=2, default=str)
        )
        print(f"  wrote best IR → {args.out}")

    return 0 if result["converged"] else 1


if __name__ == "__main__":
    sys.exit(main())

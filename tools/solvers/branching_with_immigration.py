"""Closed-form kernel — Galton-Watson Branching with Immigration.

Industry pattern (cascading bonus with random "external" bonus
drops on top of the branching cascade — e.g. cluster avalanche
where new random clusters can also seed mid-cascade):

  • At each generation, each parent spawns N ~ Offspring(mean=m).
  • Plus, each generation an IMMIGRATION term I ~ Imm(mean=ν)
    adds new clusters independent of parents.

Closed-form for E[Z_n] in stationary regime (subcritical m < 1):
  E[Z_∞] = ν / (1 - m)

Total expected clusters across N generations:
  E[total] ≈ N · ν / (1 - m)   (for large N in steady state)
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class BranchingImmigrationParams:
    p_trigger: float
    offspring_mean: float          # m
    immigration_mean: float        # ν
    n_generations: int
    pay_per_cluster: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def stationary_population(p: BranchingImmigrationParams) -> float:
    if p.offspring_mean >= 1.0:
        return float("inf")
    if p.offspring_mean < 0:
        raise ValueError("offspring_mean must be >= 0")
    return p.immigration_mean / (1.0 - p.offspring_mean)


def expected_total_clusters(p: BranchingImmigrationParams) -> float:
    if p.n_generations <= 0:
        return 0.0
    if p.offspring_mean >= 1.0:
        # Truncated sum
        total = 0.0
        gen_size = p.immigration_mean
        for _ in range(p.n_generations):
            total += gen_size + p.immigration_mean
            gen_size = gen_size * p.offspring_mean + p.immigration_mean
        return total
    # Iterate recursion Z_{n+1} = m · Z_n + ν, Z_0 = 0
    z = 0.0
    total = 0.0
    for _ in range(p.n_generations):
        z = p.offspring_mean * z + p.immigration_mean
        total += z
    return total


def analytical_rtp(p: BranchingImmigrationParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    return p.p_trigger * expected_total_clusters(p) * p.pay_per_cluster


def mc_simulate(p: BranchingImmigrationParams, spins: int = 20_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    cluster_counts: list[int] = []
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            cluster_counts.append(0)
            continue
        z = 0
        seen = 0
        for _ in range(p.n_generations):
            # Offspring step: each existing cluster spawns Poisson(m) new
            next_offspring = 0
            for _ in range(z):
                # Poisson(m) via Knuth
                import math
                L = math.exp(-p.offspring_mean)
                k = 0
                prod = rng.random()
                while prod > L:
                    k += 1
                    prod *= rng.random()
                next_offspring += k
            # Immigration step: Poisson(ν)
            import math
            L = math.exp(-p.immigration_mean)
            imm = 0
            prod = rng.random()
            while prod > L:
                imm += 1
                prod *= rng.random()
            z = next_offspring + imm
            seen += z
        cluster_counts.append(seen)
        total += seen * p.pay_per_cluster
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_clusters": sum(cluster_counts) / max(spins, 1),
    }

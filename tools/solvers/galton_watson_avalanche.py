"""Closed-form kernel — Galton-Watson Avalanche Branching.

Industry pattern (Pragmatic Sweet Bonanza cluster avalanche):
each cleared cluster spawns a random number of NEW clusters (the
"offspring" distribution). Total expected clusters per spin is
governed by Galton-Watson branching process theory.

Closed-form (subcritical, m < 1)
================================

If E[offspring] = m and Var[offspring] = sigma^2, total cluster
count Z across all generations starting from Z_0 = 1 satisfies:
  E[total Z] = 1 / (1 - m)
  Var[total Z] = sigma^2 / ((1 - m)^3)

For an initial trigger probability p_initial and per-cluster pay
`pay_per_cluster`:
  uplift_per_spin = p_initial · (1 / (1 - m)) · pay_per_cluster
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from statistics import mean, pvariance


@dataclass
class GaltonWatsonAvalancheParams:
    p_initial: float
    offspring_dist: dict[int, float]   # {n_children: weight}, auto-normalized
    pay_per_cluster: float
    max_generations: int = 50


ACCEPTANCE_TOLERANCE_MC = 0.05


def _normalized(dist: dict[int, float]) -> dict[int, float]:
    s = sum(dist.values())
    if s <= 0:
        raise ValueError("offspring_dist weights must sum to > 0")
    return {k: v / s for k, v in dist.items()}


def offspring_mean(dist: dict[int, float]) -> float:
    d = _normalized(dist)
    return sum(k * v for k, v in d.items())


def expected_total_clusters(p: GaltonWatsonAvalancheParams) -> float:
    m = offspring_mean(p.offspring_dist)
    if m >= 1.0:
        # Supercritical; truncate to max_generations sum (geometric divergent)
        total = 0.0
        gen_size = 1.0
        for _ in range(p.max_generations):
            total += gen_size
            gen_size *= m
        return total
    return 1.0 / (1.0 - m)


def analytical_rtp(p: GaltonWatsonAvalancheParams) -> float:
    if not (0.0 <= p.p_initial <= 1.0):
        raise ValueError("p_initial out of [0, 1]")
    return p.p_initial * expected_total_clusters(p) * p.pay_per_cluster


def mc_simulate(p: GaltonWatsonAvalancheParams, spins: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    norm = _normalized(p.offspring_dist)
    ks = sorted(norm.keys())
    cdf = []
    acc = 0.0
    for k in ks:
        acc += norm[k]
        cdf.append(acc)
    total = 0.0
    cluster_counts: list[int] = []
    for _ in range(spins):
        if rng.random() >= p.p_initial:
            cluster_counts.append(0)
            continue
        # Initial cluster (gen 0)
        gen = [1]   # number of clusters in current generation
        clusters_seen = 1
        for _ in range(p.max_generations):
            next_count = 0
            for _ in range(gen[-1]):
                r = rng.random()
                chosen = ks[-1]
                for i, c in enumerate(cdf):
                    if r < c:
                        chosen = ks[i]
                        break
                next_count += chosen
            if next_count == 0:
                break
            gen.append(next_count)
            clusters_seen += next_count
        cluster_counts.append(clusters_seen)
        total += clusters_seen * p.pay_per_cluster
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_clusters": mean(cluster_counts) if cluster_counts else 0.0,
        "var_clusters": pvariance(cluster_counts) if len(cluster_counts) > 1 else 0.0,
    }

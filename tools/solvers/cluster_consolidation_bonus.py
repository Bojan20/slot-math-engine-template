"""Closed-form kernel — Cluster Consolidation Bonus.

Industry pattern (Pragmatic Sweet Bonanza upgrade, Push Gaming Jammin
Jars cluster bonuses): when N independent clusters (each ≥ min_size)
land on the same spin, a multi-cluster bonus is awarded that pays
`base_pay × consolidation_factor(N)`.

Closed-form for `N ~ Binomial(max_clusters, p_cluster_lands)`:

  E[payout] = Σ_{n=0..max_clusters} P(N=n) · base_pay · factor(n)

The factor curve is supplied by the designer (typically 0 for n=0,
1 for n=1, 2.5-5x for n=2, 10x+ for n=3+).
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class ClusterConsolidationParams:
    max_clusters: int
    p_cluster_lands: float
    base_pay: float
    factor_curve: dict[int, float]   # {n: multiplier}, n=0 typically 0


ACCEPTANCE_TOLERANCE_MC = 0.05


def _binomial_pmf(n_trials: int, k: int, p: float) -> float:
    if not (0 <= k <= n_trials):
        return 0.0
    return (
        math.comb(n_trials, k)
        * (p ** k)
        * ((1.0 - p) ** (n_trials - k))
    )


def analytical_rtp(p: ClusterConsolidationParams) -> float:
    if not (0.0 <= p.p_cluster_lands <= 1.0):
        raise ValueError("p_cluster_lands out of [0, 1]")
    if p.max_clusters < 0:
        raise ValueError("max_clusters must be >= 0")
    total = 0.0
    for n in range(p.max_clusters + 1):
        pmf = _binomial_pmf(p.max_clusters, n, p.p_cluster_lands)
        factor = p.factor_curve.get(n, p.factor_curve.get(min(n, max(p.factor_curve)), 0.0))
        total += pmf * factor
    return p.base_pay * total


def mc_simulate(p: ClusterConsolidationParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    cluster_counts: list[int] = []
    fallback = 0.0
    if p.factor_curve:
        fallback = p.factor_curve.get(max(p.factor_curve), 0.0)
    for _ in range(spins):
        n = sum(1 for _ in range(p.max_clusters)
                if rng.random() < p.p_cluster_lands)
        cluster_counts.append(n)
        factor = p.factor_curve.get(n, fallback if n > max(p.factor_curve, default=0) else 0.0)
        total += p.base_pay * factor
    avg = sum(cluster_counts) / max(spins, 1)
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_clusters_per_spin": avg,
    }

"""Closed-form kernel — Scatter Progressive Unlock.

Industry pattern (Pragmatic Gates of Olympus collect-scatter
multiplier, Push Gaming Razor Returns scatter-tier unlocks):
collecting N scatters across a session unlocks a tier-N
multiplier × `base_pay`. The tier table maps `n_scatters → multiplier`.

For Binomial(n_spins, p_scatter_per_spin):
  P(N=k) = C(n_spins, k) · p^k · (1-p)^(n_spins-k)
  E[payout] = base_pay · Σ_k P(N=k) · tier_mult[min(k, max_tier)]
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class ScatterProgressiveUnlockParams:
    n_spins: int
    p_scatter_per_spin: float
    tier_multipliers: list[float]   # tier_multipliers[k] for k scatters
    base_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _binomial_pmf(n: int, k: int, p: float) -> float:
    if not (0 <= k <= n):
        return 0.0
    return math.comb(n, k) * (p ** k) * ((1.0 - p) ** (n - k))


def analytical_rtp(p: ScatterProgressiveUnlockParams) -> float:
    if not (0.0 <= p.p_scatter_per_spin <= 1.0):
        raise ValueError("p_scatter_per_spin out of [0, 1]")
    if p.n_spins <= 0:
        raise ValueError("n_spins must be > 0")
    if not p.tier_multipliers:
        return 0.0
    max_tier = len(p.tier_multipliers) - 1
    total = 0.0
    for k in range(p.n_spins + 1):
        pmf = _binomial_pmf(p.n_spins, k, p.p_scatter_per_spin)
        mult = p.tier_multipliers[min(k, max_tier)]
        total += pmf * mult
    return p.base_pay * total


def mc_simulate(p: ScatterProgressiveUnlockParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    scatter_counts: list[int] = []
    max_tier = max(0, len(p.tier_multipliers) - 1)
    for _ in range(spins):
        scatters = sum(
            1 for _ in range(p.n_spins) if rng.random() < p.p_scatter_per_spin
        )
        scatter_counts.append(scatters)
        if not p.tier_multipliers:
            continue
        total += p.base_pay * p.tier_multipliers[min(scatters, max_tier)]
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_scatters": sum(scatter_counts) / max(spins, 1),
    }

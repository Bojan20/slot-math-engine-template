"""Closed-form kernel — Megaways × Cascade Compound.

Industry pattern (BTG Megaways + tumble): each cascade reduces the
ways count by reel-height collapse; with each cascade an unlocking
multiplier increments. The compound RTP per trigger combines:

  • E[ways_total] across cascades (geometrically declining)
  • E[cascade_multiplier] (additive +1 per cascade)
  • base pay per way

Closed-form
===========

Let p_cascade = P(another cascade follows). Expected cascade count:
  E[N] = 1 + p / (1 - p)            for p < 1
       = ∞ otherwise (degenerate)

If multiplier starts at 1 and increments by +1 per cascade:
  E[multiplier_at_cascade_k] = k
  E[Σ k · ways_k · p^(k-1)] = ways_0 · Σ k · (p · q_ways)^(k-1)

where q_ways ∈ (0, 1] is the ways-shrinkage factor (1 → no shrink).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class MegawaysCascadeParams:
    ways_initial: int
    p_cascade: float
    q_ways_shrink: float        # multiplicative ways factor per cascade ∈ (0, 1]
    pay_per_way: float
    max_cascades: int           # safety cap


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_cascades(p_cascade: float, max_cascades: int) -> float:
    if not (0.0 <= p_cascade < 1.0):
        if p_cascade == 1.0:
            return float(max_cascades)
        raise ValueError("p_cascade must be in [0, 1)")
    # E[N] for truncated geometric (count includes the first cascade
    # event; series 1 + p + p^2 + … + p^(max-1) = (1 - p^max) / (1 - p))
    if max_cascades <= 0:
        return 0.0
    return (1.0 - p_cascade ** max_cascades) / (1.0 - p_cascade)


def analytical_rtp(p: MegawaysCascadeParams) -> float:
    if p.ways_initial <= 0:
        raise ValueError("ways_initial must be > 0")
    if not (0.0 < p.q_ways_shrink <= 1.0):
        raise ValueError("q_ways_shrink must be in (0, 1]")
    if p.max_cascades <= 0:
        return 0.0
    if not (0.0 <= p.p_cascade < 1.0):
        if p.p_cascade != 1.0:
            raise ValueError("p_cascade must be in [0, 1]")
    rho = p.p_cascade * p.q_ways_shrink
    # Cascade k=1..N contributes k · ways_k · (p_cascade^(k-1))
    # ways_k = ways_initial · q^(k-1).
    # Closed form ignores explicit truncation by max_cascades for
    # simplicity (geometric series convergence handles tail). We still
    # cap MC at max_cascades for runtime safety.
    if rho >= 1.0:
        # Series diverges; use truncated sum
        total = 0.0
        for k in range(1, p.max_cascades + 1):
            ways_k = p.ways_initial * (p.q_ways_shrink ** (k - 1))
            total += k * ways_k * (p.p_cascade ** (k - 1))
        return total * p.pay_per_way
    # Σ_{k≥1} k · rho^(k-1) = 1 / (1 - rho)^2
    base = 1.0 / (1.0 - rho) ** 2
    return p.ways_initial * p.pay_per_way * base


def mc_simulate(p: MegawaysCascadeParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    cascade_lengths: list[int] = []
    for _ in range(spins):
        ways = p.ways_initial
        cascades = 0
        # First spin is "cascade 1" with multiplier 1
        spin_pay = 0.0
        for k in range(1, p.max_cascades + 1):
            spin_pay += k * ways * p.pay_per_way
            cascades = k
            ways = ways * p.q_ways_shrink
            if rng.random() >= p.p_cascade:
                break
        cascade_lengths.append(cascades)
        total += spin_pay
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_cascades": sum(cascade_lengths) / max(spins, 1),
    }

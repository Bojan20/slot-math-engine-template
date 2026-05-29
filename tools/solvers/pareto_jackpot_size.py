"""Closed-form kernel — Pareto Heavy-Tail Jackpot Size.

Industry pattern (progressive jackpot SIZE distribution at hit):
jackpot pool sizes follow a Pareto(alpha, x_min) — heavy-tailed,
median << mean for alpha close to 1. Operator must understand:

  • E[jackpot] = alpha · x_min / (alpha - 1)         for alpha > 1
  • Var[jackpot] = alpha · x_min^2 / ((alpha - 1)^2 (alpha - 2))   alpha > 2
  • P(jackpot > k · x_min) = k^{-alpha}

Per-spin RTP:
  uplift = p_hit · E[jackpot]
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class ParetoJackpotParams:
    p_hit_per_spin: float
    alpha: float
    x_min: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_jackpot(p: ParetoJackpotParams) -> float:
    if p.alpha <= 1.0:
        return float("inf")
    if p.x_min <= 0:
        raise ValueError("x_min must be > 0")
    return p.alpha * p.x_min / (p.alpha - 1.0)


def variance_jackpot(p: ParetoJackpotParams) -> float:
    if p.alpha <= 2.0:
        return float("inf")
    return p.alpha * p.x_min ** 2 / ((p.alpha - 1.0) ** 2 * (p.alpha - 2.0))


def prob_exceeds_factor(p: ParetoJackpotParams, k: float) -> float:
    if k < 1:
        return 1.0
    return k ** (-p.alpha)


def analytical_rtp(p: ParetoJackpotParams) -> float:
    if not (0.0 <= p.p_hit_per_spin <= 1.0):
        raise ValueError("p_hit_per_spin out of [0, 1]")
    return p.p_hit_per_spin * expected_jackpot(p)


def mc_simulate(p: ParetoJackpotParams, spins: int = 200_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    hits = 0
    for _ in range(spins):
        if rng.random() < p.p_hit_per_spin:
            hits += 1
            u = rng.random()
            jp = p.x_min / ((1.0 - u) ** (1.0 / p.alpha))
            total += jp
    return {
        "rtp_mc": total / max(spins, 1),
        "hit_rate": hits / max(spins, 1),
    }

"""Closed-form kernel — Gumbel Extreme-Value Big-Win Model.

Industry pattern (max-win capped designs, "10,000× cap" rules):
the per-spin max-win across a session approximately follows a
Gumbel extreme-value distribution. Designer calibrates location μ
and scale β, then verifies the cap holds:

  Pr(max_win > cap) = 1 - exp(-exp(-(cap - μ) / β))

The kernel returns:
  • analytical_rtp = E[max_win across N spins] (truncated by cap)
  • prob_cap_hit  = P(any spin exceeds cap)
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


_EULER_MASCHERONI = 0.5772156649015329


@dataclass
class GumbelExtremeParams:
    n_spins: int
    mu: float
    beta: float
    cap: float                  # operator-imposed max-win cap (x-bet units)


ACCEPTANCE_TOLERANCE_MC = 0.05


def gumbel_cdf(x: float, mu: float, beta: float) -> float:
    if beta <= 0:
        raise ValueError("beta must be > 0")
    return math.exp(-math.exp(-(x - mu) / beta))


def prob_cap_hit(p: GumbelExtremeParams) -> float:
    if p.n_spins <= 0:
        return 0.0
    # P(any spin > cap) = 1 - P(all <= cap) = 1 - CDF(cap)^n
    return 1.0 - gumbel_cdf(p.cap, p.mu, p.beta) ** p.n_spins


def expected_max_uncapped(p: GumbelExtremeParams) -> float:
    """E[max] of n iid Gumbel(mu, beta) ≈ mu + beta · (γ + ln n)."""
    if p.n_spins <= 0:
        return p.mu
    return p.mu + p.beta * (_EULER_MASCHERONI + math.log(p.n_spins))


def analytical_rtp(p: GumbelExtremeParams) -> float:
    if p.beta <= 0:
        raise ValueError("beta must be > 0")
    e_max = expected_max_uncapped(p)
    # Cap the analytical estimate at the cap value
    return min(e_max, p.cap)


def mc_simulate(p: GumbelExtremeParams, sessions: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    cap_hits = 0
    for _ in range(sessions):
        maxv = float("-inf")
        for _ in range(p.n_spins):
            u = rng.random()
            # inverse Gumbel CDF sample
            x = p.mu - p.beta * math.log(-math.log(u))
            if x > maxv:
                maxv = x
        if maxv > p.cap:
            cap_hits += 1
        total += min(maxv, p.cap)
    return {
        "rtp_mc": total / max(sessions, 1),
        "cap_hit_rate": cap_hits / max(sessions, 1),
    }

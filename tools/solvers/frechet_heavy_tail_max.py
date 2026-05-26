"""Closed-form kernel — Fréchet Heavy-Tail EVT.

Industry pattern (extreme-value distribution for catastrophe-style
max-wins where the tail is HEAVIER than Gumbel — i.e. power-law
right tail). Fréchet(α, s, m) CDF:

  F(x) = exp(-((x - m) / s)^(-α))   for x > m

E[max] (α > 1):
  E[X] = m + s · Γ(1 - 1/α)
Variance (α > 2):
  Var[X] = s^2 · [Γ(1 - 2/α) - Γ(1 - 1/α)^2]
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class FrechetMaxParams:
    n_spins: int
    alpha: float
    s_scale: float
    m_location: float = 0.0


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_max(p: FrechetMaxParams) -> float:
    if p.alpha <= 1.0:
        return float("inf")
    if p.s_scale <= 0:
        raise ValueError("s_scale must be > 0")
    # For Fréchet n iid: max ~ Fréchet(α, s · n^(1/α), m)
    if p.n_spins <= 0:
        return p.m_location
    scaled = p.s_scale * (p.n_spins ** (1.0 / p.alpha))
    return p.m_location + scaled * math.gamma(1.0 - 1.0 / p.alpha)


def variance_max(p: FrechetMaxParams) -> float:
    if p.alpha <= 2.0:
        return float("inf")
    scaled = p.s_scale * (p.n_spins ** (1.0 / p.alpha))
    g1 = math.gamma(1.0 - 1.0 / p.alpha)
    g2 = math.gamma(1.0 - 2.0 / p.alpha)
    return scaled ** 2 * (g2 - g1 ** 2)


def analytical_rtp(p: FrechetMaxParams) -> float:
    return expected_max(p)


def mc_simulate(p: FrechetMaxParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    for _ in range(sessions):
        max_val = float("-inf")
        for _ in range(p.n_spins):
            u = rng.random()
            # Fréchet inverse CDF: x = m + s · (-log u)^(-1/α)
            x = p.m_location + p.s_scale * ((-math.log(max(u, 1e-12))) ** (-1.0 / p.alpha))
            if x > max_val:
                max_val = x
        total += max_val
    return {
        "rtp_mc": total / max(sessions, 1),
    }

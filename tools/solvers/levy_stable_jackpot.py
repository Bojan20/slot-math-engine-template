"""Closed-form kernel — Lévy α-Stable Jackpot Tail.

Industry pattern (regulator-mandated tail-risk model for max-win
events; α-stable distributions capture power-law heavy tails with
analytical characteristic functions).

For α ∈ (0, 2), the Lévy α-stable has tail asymptotic:

  P(X > x) ~ C_α · σ^α · x^(-α)    as x → ∞

where C_α = (1 + β) / 2 · Γ(α) · sin(π α / 2) / π (for β ≠ -1).

This kernel exposes:
  • prob_exceeds(x): tail probability via asymptotic formula
  • analytical_rtp: expected jackpot = ∫ x · pdf(x) dx (finite only for α > 1)
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class LevyStableJackpotParams:
    p_trigger: float
    alpha: float              # stability index ∈ (0, 2]
    beta: float               # skew ∈ [-1, 1]
    sigma: float              # scale
    x_min: float = 1.0        # lower truncation for tail formula


ACCEPTANCE_TOLERANCE_MC = 0.10


def tail_constant(p: LevyStableJackpotParams) -> float:
    if not (0.0 < p.alpha <= 2.0):
        raise ValueError("alpha must be in (0, 2]")
    if not (-1.0 <= p.beta <= 1.0):
        raise ValueError("beta must be in [-1, 1]")
    if p.beta == -1.0:
        return 0.0
    return (
        (1.0 + p.beta) / 2.0
        * math.gamma(p.alpha) * math.sin(math.pi * p.alpha / 2.0) / math.pi
    )


def prob_exceeds(p: LevyStableJackpotParams, x: float) -> float:
    """Asymptotic tail probability P(X > x) for large x."""
    if x <= 0:
        return 1.0
    return tail_constant(p) * (p.sigma ** p.alpha) * (x ** (-p.alpha))


def expected_jackpot_finite(p: LevyStableJackpotParams) -> float:
    """Conditional E[X | X > x_min] via tail asymptotic (α > 1).

    For α > 1 a heavy-tail mean conditional on exceeding x_min is:
      E[X | X > x_min] = (α / (α - 1)) · x_min
    """
    if p.alpha <= 1.0:
        return float("inf")
    return (p.alpha / (p.alpha - 1.0)) * p.x_min


def analytical_rtp(p: LevyStableJackpotParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.alpha <= 1.0:
        return float("inf")
    return p.p_trigger * prob_exceeds(p, p.x_min) * expected_jackpot_finite(p)


def mc_simulate(p: LevyStableJackpotParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    """Sample tail via Pareto with exponent α (truncated at x_min)."""
    rng = random.Random(seed)
    total = 0.0
    tail_hits = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        # Use Pareto approximation for the heavy tail
        u = rng.random()
        x = p.x_min / ((1.0 - u) ** (1.0 / p.alpha))
        if x > p.x_min:
            tail_hits += 1
            total += x * prob_exceeds(p, p.x_min)
    return {
        "rtp_mc": total / max(spins, 1),
        "tail_rate": tail_hits / max(spins, 1),
    }

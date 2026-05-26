"""Closed-form kernel — Tail Dependence Multi-Jackpot.

Industry pattern (multi-tier linked jackpot pools where extreme
outcomes co-trigger): N independent jackpot pools, but per-pool
trigger probabilities are correlated via a Gaussian copula at the
extremes — when one fires, others are more likely to fire too.

Closed-form upper bound (Fréchet-Hoeffding):
  P(both fire) <= min(p1, p2)
  P(both fire) >= max(0, p1 + p2 - 1)

Tail-dependence coefficient lambda_U:
  P(X2 > q | X1 > q) → lambda_U as q → 1.

This kernel exposes:
  • independence baseline: Σ p_i · pay_i
  • tail-augmented baseline: independence + λ_U · (worst-case co-fire bonus)
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class TailDependenceJackpotParams:
    pool_probs: list[float]          # p_i per pool
    pool_pays: list[float]           # pay_i per pool
    lambda_upper: float              # tail-dep coefficient ∈ [0, 1]
    co_fire_bonus: float             # extra paid when any 2 pools co-fire


ACCEPTANCE_TOLERANCE_MC = 0.05


def independence_rtp(p: TailDependenceJackpotParams) -> float:
    if len(p.pool_probs) != len(p.pool_pays):
        raise ValueError("probs/pays length mismatch")
    for pr in p.pool_probs:
        if not (0.0 <= pr <= 1.0):
            raise ValueError("each pool_prob must be in [0, 1]")
    return sum(pr * pay for pr, pay in zip(p.pool_probs, p.pool_pays))


def tail_augmented_rtp(p: TailDependenceJackpotParams) -> float:
    base = independence_rtp(p)
    if not (0.0 <= p.lambda_upper <= 1.0):
        raise ValueError("lambda_upper out of [0, 1]")
    # Sum over distinct unordered pairs (i, j); upper bound on co-fire prob
    # = min(p_i, p_j) when lambda_U = 1, scaled by lambda_U otherwise.
    co_fire_contribution = 0.0
    for i in range(len(p.pool_probs)):
        for j in range(i + 1, len(p.pool_probs)):
            co_fire_contribution += (
                p.lambda_upper * min(p.pool_probs[i], p.pool_probs[j])
                * p.co_fire_bonus
            )
    return base + co_fire_contribution


def analytical_rtp(p: TailDependenceJackpotParams) -> float:
    return tail_augmented_rtp(p)


def mc_simulate(p: TailDependenceJackpotParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    """Simulate Gaussian-copula correlated triggers with `lambda_upper` proxy."""
    rng = random.Random(seed)
    total = 0.0
    co_fires = 0
    for _ in range(spins):
        # Generate a base Gaussian factor; per-pool factor mixes with idiosyncratic.
        rho = p.lambda_upper
        z_common = rng.gauss(0, 1)
        fired_any = []
        for pr in p.pool_probs:
            z_idio = rng.gauss(0, 1)
            z = rho * z_common + (1 - rho) * z_idio
            # Convert to uniform via normal CDF approx
            u = 0.5 * (1 + _erf_approx(z / (2 ** 0.5)))
            fired_any.append(u < pr)
        # Independent pays
        for fired, pay in zip(fired_any, p.pool_pays):
            if fired:
                total += pay
        # Co-fire bonus per pair fired
        n_fired = sum(fired_any)
        if n_fired >= 2:
            from math import comb
            co_fires += 1
            total += comb(n_fired, 2) * p.co_fire_bonus
    return {
        "rtp_mc": total / max(spins, 1),
        "co_fire_rate": co_fires / max(spins, 1),
    }


def _erf_approx(x: float) -> float:
    """Abramowitz-Stegun erf approximation."""
    # Constants
    a1, a2, a3, a4, a5 = 0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429
    sign = 1.0 if x >= 0 else -1.0
    x = abs(x)
    t = 1.0 / (1.0 + 0.3275911 * x)
    y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * (2.71828182845904523536 ** (-x * x))
    return sign * y

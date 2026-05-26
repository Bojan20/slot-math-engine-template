"""Closed-form kernel — Negative Binomial Bonus Attempts.

Industry pattern (collect-to-trigger bonuses where bonus fires
once player accumulates `r` triggers): each spin has probability
`p_trigger` of producing a trigger token. The bonus pays
`bonus_pay` once `r` tokens are accumulated; sessions reset on
payout.

Closed-form
===========

Number of spins until r-th success ~ Negative Binomial(r, p).
  E[spins to r-th trigger] = r / p_trigger
  P(reach r within n_spins) = Σ_{k=r..n} C(n-1, r-1) ... (Pascal form)

Long-run RTP per unit bet:
  uplift_per_spin = bonus_pay · p_trigger / r
                  = bonus_pay / E[spins to reach r]
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class NegBinomialAttemptsParams:
    r_target: int                 # triggers needed to fire bonus
    p_trigger: float              # P(trigger token per spin)
    bonus_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_spins_to_fire(r: int, p: float) -> float:
    if r <= 0:
        raise ValueError("r_target must be > 0")
    if not (0.0 < p <= 1.0):
        raise ValueError("p_trigger out of (0, 1]")
    return r / p


def prob_fire_within(r: int, p: float, n_spins: int) -> float:
    """P(N_r <= n_spins) where N_r is spins to r-th success."""
    if n_spins < r:
        return 0.0
    # Sum negbin pmf: P(N_r = k) = C(k-1, r-1) · p^r · (1-p)^(k-r)
    total = 0.0
    for k in range(r, n_spins + 1):
        total += math.comb(k - 1, r - 1) * (p ** r) * ((1.0 - p) ** (k - r))
    return total


def analytical_rtp(p: NegBinomialAttemptsParams) -> float:
    e_spins = expected_spins_to_fire(p.r_target, p.p_trigger)
    return p.bonus_pay / e_spins


def mc_simulate(p: NegBinomialAttemptsParams, spins: int = 200_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    accum = 0
    total = 0.0
    fires = 0
    for _ in range(spins):
        if rng.random() < p.p_trigger:
            accum += 1
            if accum >= p.r_target:
                total += p.bonus_pay
                fires += 1
                accum = 0
    return {
        "rtp_mc": total / max(spins, 1),
        "fire_rate": fires / max(spins, 1),
    }

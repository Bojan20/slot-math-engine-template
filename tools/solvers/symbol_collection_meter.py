"""Closed-form kernel — Symbol Collection Meter.

Industry pattern (Pragmatic Big Bass collection meter, NetEnt Dead or
Alive 2 bonus picks): a meter fills up by collecting a target symbol
across spins; reaching N triggers a fixed-pay bonus. Models a
truncated geometric over Bernoulli trials.

Closed-form
===========

  Trials per session window W = window_spins
  Per-spin landing prob   = p_land
  Threshold count         = N

  P(filled within W) = 1 − F(W, p_land, N)
  where F is the CDF of a Negative Binomial (Pascal) with r=N, p=p_land.

  RTP per spin = pay_on_fill × P(filled within W) / W

We use the regularized incomplete beta function via repeated
Bernoulli formula for small N (typical 3-10).
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass


@dataclass
class CollectionMeterParams:
    p_land: float
    threshold: int
    window_spins: int
    pay_on_fill: float


def _pmf_negbin(k_failures: int, r: int, p: float) -> float:
    """P(NB=r,p has exactly k failures before r-th success)."""
    if p <= 0 or r <= 0:
        return 0.0
    if p >= 1:
        return 1.0 if k_failures == 0 else 0.0
    return math.comb(k_failures + r - 1, k_failures) \
        * (p ** r) * ((1.0 - p) ** k_failures)


def prob_filled_within_window(p: CollectionMeterParams) -> float:
    """P(at least `threshold` hits within `window_spins`).

    Negative binomial CDF: P(K ≤ W − N) where K is the number of
    failures before the N-th success.
    """
    if p.p_land <= 0 or p.threshold <= 0:
        return 0.0
    if p.window_spins < p.threshold:
        return 0.0
    max_failures = p.window_spins - p.threshold
    return sum(
        _pmf_negbin(k, p.threshold, p.p_land)
        for k in range(max_failures + 1)
    )


def analytical_rtp(p: CollectionMeterParams) -> float:
    """Per-spin RTP contribution = pay_on_fill × P(fill) / window."""
    if p.window_spins <= 0 or p.pay_on_fill <= 0:
        return 0.0
    return p.pay_on_fill * prob_filled_within_window(p) / p.window_spins


def mc_simulate(p: CollectionMeterParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_pay = 0.0
    fills = 0
    for _ in range(sessions):
        hits = 0
        for _spin in range(p.window_spins):
            if rng.random() < p.p_land:
                hits += 1
                if hits >= p.threshold:
                    total_pay += p.pay_on_fill
                    fills += 1
                    break
    return {
        "rtp_mc": total_pay / max(sessions * p.window_spins, 1),
        "fill_rate": fills / max(sessions, 1),
    }

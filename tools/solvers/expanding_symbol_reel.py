"""Closed-form kernel — Expanding Symbol on Reel.

Industry pattern (NetEnt Book of Dead expanding symbol):
during free spins, a designated `chosen_symbol` lands on any reel
and expands to cover the full reel height before line evaluation.

Closed-form per spin:
  P(symbol lands on a given reel) = p_symbol_on_reel
  P(symbol lands on >=1 reel) = 1 - (1 - p)^reels

Expected RTP contribution (single-line, assumes if `min_reels`
expanded reels appear, a line pays):

  P(>= min_reels expanded) = Σ_{k=min..R} C(R,k) p^k (1-p)^(R-k)
  uplift = P(>= min_reels) · pay_5oak
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class ExpandingSymbolParams:
    reels: int
    p_symbol_on_reel: float
    min_reels_for_line: int
    pay_5oak: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _binomial_pmf(n: int, k: int, p: float) -> float:
    if not (0 <= k <= n):
        return 0.0
    return math.comb(n, k) * (p ** k) * ((1.0 - p) ** (n - k))


def prob_line(p: ExpandingSymbolParams) -> float:
    if not (0.0 <= p.p_symbol_on_reel <= 1.0):
        raise ValueError("p_symbol_on_reel out of [0, 1]")
    if p.reels <= 0:
        raise ValueError("reels must be > 0")
    if p.min_reels_for_line <= 0:
        return 1.0
    if p.min_reels_for_line > p.reels:
        return 0.0
    total = 0.0
    for k in range(p.min_reels_for_line, p.reels + 1):
        total += _binomial_pmf(p.reels, k, p.p_symbol_on_reel)
    return total


def analytical_rtp(p: ExpandingSymbolParams) -> float:
    return prob_line(p) * p.pay_5oak


def mc_simulate(p: ExpandingSymbolParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    fires = 0
    for _ in range(spins):
        k = sum(1 for _ in range(p.reels)
                if rng.random() < p.p_symbol_on_reel)
        if k >= p.min_reels_for_line:
            fires += 1
            total += p.pay_5oak
    return {
        "rtp_mc": total / max(spins, 1),
        "fire_rate": fires / max(spins, 1),
    }

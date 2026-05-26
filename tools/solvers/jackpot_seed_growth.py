"""Closed-form kernel — Jackpot Seed Growth.

Industry pattern (Wide Area Progressives + Local Mystery jackpots):
each spin contributes `bet_contribution_rate × bet` to the jackpot
pool. The jackpot is awarded when a triggering event with
probability `p_jp_per_spin` occurs.

Closed-form
===========

Operating rule: at long-run steady state the expected JP at
trigger equals the seed plus the pool accumulated between hits:

  E[hits_between] = 1 / p_jp_per_spin
  E[pool_at_hit]  = seed + bet_contribution_rate · bet · E[hits_between]
  expected_award  = E[pool_at_hit]

Per-spin RTP contribution (in unit-bet terms):
  contribution = p_jp_per_spin · expected_award / bet
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class JackpotSeedGrowthParams:
    bet: float
    bet_contribution_rate: float
    p_jp_per_spin: float
    seed: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_award(p: JackpotSeedGrowthParams) -> float:
    if not (0.0 < p.p_jp_per_spin <= 1.0):
        raise ValueError("p_jp_per_spin out of (0, 1]")
    if p.bet <= 0:
        raise ValueError("bet must be > 0")
    if p.seed < 0:
        raise ValueError("seed must be >= 0")
    hits_between = 1.0 / p.p_jp_per_spin
    pool = p.bet_contribution_rate * p.bet * hits_between
    return p.seed + pool


def analytical_rtp(p: JackpotSeedGrowthParams) -> float:
    award = expected_award(p)
    return p.p_jp_per_spin * award / p.bet


def mc_simulate(p: JackpotSeedGrowthParams, spins: int = 200_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    pool = p.seed
    total_award = 0.0
    hits = 0
    for _ in range(spins):
        pool += p.bet_contribution_rate * p.bet
        if rng.random() < p.p_jp_per_spin:
            hits += 1
            total_award += pool
            pool = p.seed   # reset to seed on hit
    return {
        "rtp_mc": total_award / max(spins * p.bet, 1e-9),
        "hit_rate": hits / max(spins, 1),
    }

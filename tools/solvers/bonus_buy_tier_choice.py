"""Closed-form kernel — Bonus Buy Tier Choice.

Industry pattern (Hacksaw Wanted Dead / Nolimit Buy / Stakelogic
Triple Buy): player chooses a buy tier; each tier has a cost
multiplier × stake and a tier-specific bonus RTP. The kernel
computes per-tier EV + identifies the dominant tier + crossover
points where one tier is strictly better than another.

Closed-form
===========

For tier i with cost_x_i and rtp_bonus_i:
  ev_i = rtp_bonus_i - cost_x_i

`positive_ev_tiers` = tiers where ev_i > 0
`best_tier` = argmax_i ev_i (largest positive EV; None if all negative)
`dominance_table[i][j]` = bool: tier i dominates tier j on EV
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Sequence


@dataclass
class BonusBuyTier:
    label: str
    cost_x: float
    rtp_bonus: float    # average bonus RTP × cost_x (per real bet unit)


@dataclass
class BonusBuyTierChoiceParams:
    tiers: Sequence[BonusBuyTier]


ACCEPTANCE_TOLERANCE_MC = 0.01


def ev_per_tier(p: BonusBuyTierChoiceParams) -> list[float]:
    return [t.rtp_bonus - t.cost_x for t in p.tiers]


def best_tier_index(p: BonusBuyTierChoiceParams) -> int | None:
    evs = ev_per_tier(p)
    if not evs:
        return None
    best = max(range(len(evs)), key=lambda i: evs[i])
    if evs[best] <= 0:
        return None
    return best


def dominance_table(p: BonusBuyTierChoiceParams) -> list[list[bool]]:
    evs = ev_per_tier(p)
    n = len(evs)
    out = [[False] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            out[i][j] = (
                p.tiers[i].rtp_bonus >= p.tiers[j].rtp_bonus
                and p.tiers[i].cost_x <= p.tiers[j].cost_x
                and (
                    p.tiers[i].rtp_bonus > p.tiers[j].rtp_bonus
                    or p.tiers[i].cost_x < p.tiers[j].cost_x
                )
            )
    return out


def analytical_rtp(p: BonusBuyTierChoiceParams, tier_idx: int) -> float:
    """rtp_bonus / cost_x is the per-bet-unit RTP of tier i."""
    if not 0 <= tier_idx < len(p.tiers):
        raise ValueError(f"tier_idx out of range: {tier_idx}")
    t = p.tiers[tier_idx]
    if t.cost_x <= 0:
        return 0.0
    return t.rtp_bonus / t.cost_x


def mc_simulate(p: BonusBuyTierChoiceParams, tier_idx: int,
                rounds: int = 10_000, seed: int = 42,
                sigma: float = 0.1) -> dict[str, float]:
    """Simple Gaussian noise around the tier's rtp_bonus to simulate
    bonus-round payout variance. Tier RTP estimate = mean(payout) / cost."""
    rng = random.Random(seed)
    t = p.tiers[tier_idx]
    pays: list[float] = []
    for _ in range(rounds):
        # Approximate bonus payout as N(rtp_bonus, σ × rtp_bonus)
        payout = max(
            0.0,
            t.rtp_bonus + sigma * t.rtp_bonus * rng.gauss(0, 1),
        )
        pays.append(payout)
    mean_pay = sum(pays) / max(rounds, 1)
    return {
        "rtp_mc": mean_pay / max(t.cost_x, 1e-9),
        "mean_payout": mean_pay,
    }

"""Closed-form kernel — Bonus Buy Dynamic Pricing.

Industry pattern (Hacksaw Big Bass Buy Bonus, NolimitCity dynamic
Bonus Buy): the bonus-buy cost adjusts based on the player's
recent volatility / loss-streak — operator sets `discount` if a
player has lost more than `loss_threshold_x` in the last N spins,
otherwise full `base_cost_x`.

Per-trigger EV (vs. full cost):
  effective_cost = (1 - q_discounted) · base_cost_x + q_discounted · discounted_cost_x
  ev = expected_bonus_pay - effective_cost

where q_discounted = P(loss streak >= threshold).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class BonusBuyDynamicPricingParams:
    base_cost_x: float          # full bonus-buy multiplier
    discounted_cost_x: float    # discounted multiplier when condition met
    q_discounted: float         # P(player qualifies for discount)
    expected_bonus_pay: float   # E[bonus payout in x-bet units]


ACCEPTANCE_TOLERANCE_MC = 0.05


def effective_cost(p: BonusBuyDynamicPricingParams) -> float:
    if not (0.0 <= p.q_discounted <= 1.0):
        raise ValueError("q_discounted out of [0, 1]")
    return (1.0 - p.q_discounted) * p.base_cost_x + p.q_discounted * p.discounted_cost_x


def ev_per_buy(p: BonusBuyDynamicPricingParams) -> float:
    return p.expected_bonus_pay - effective_cost(p)


def analytical_rtp(p: BonusBuyDynamicPricingParams) -> float:
    """RTP of the buy in unit-bet terms: payout / effective_cost."""
    cost = effective_cost(p)
    if cost <= 0:
        return float("inf")
    return p.expected_bonus_pay / cost


def is_positive_ev(p: BonusBuyDynamicPricingParams) -> bool:
    return ev_per_buy(p) > 0.0


def mc_simulate(p: BonusBuyDynamicPricingParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_cost = 0.0
    total_pay = 0.0
    discounts_used = 0
    for _ in range(spins):
        if rng.random() < p.q_discounted:
            cost = p.discounted_cost_x
            discounts_used += 1
        else:
            cost = p.base_cost_x
        total_cost += cost
        total_pay += p.expected_bonus_pay
    return {
        "rtp_mc": total_pay / max(total_cost, 1e-9),
        "discount_rate": discounts_used / max(spins, 1),
    }

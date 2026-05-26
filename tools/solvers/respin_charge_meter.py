"""Closed-form kernel — Respin Charge Meter.

Industry pattern (Hacksaw Wanted Dead or a Wild "Bounty" meter,
ELK Studios charge-up): each respin advances a meter by 1 charge
with probability `p_charge`. The meter fills at `meter_capacity`
charges, paying a fixed `fill_pay`. The session is forcibly closed
after `max_respins` if not filled earlier.

Probability of filling within `max_respins`:
  P(fill) = P(Binomial(max_respins, p_charge) >= meter_capacity)

Expected session payout per trigger:
  E[payout] = P(fill) · fill_pay

Per-spin uplift (if the meter triggers at base hit rate `p_trigger`):
  uplift = p_trigger · P(fill) · fill_pay
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class RespinChargeMeterParams:
    p_trigger: float
    p_charge: float
    meter_capacity: int
    max_respins: int
    fill_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _binomial_tail_ge(n: int, k: int, p: float) -> float:
    """P(X >= k) for X ~ Binomial(n, p)."""
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    total = 0.0
    for j in range(k, n + 1):
        total += (
            math.comb(n, j) * (p ** j) * ((1.0 - p) ** (n - j))
        )
    return total


def prob_fill(p: RespinChargeMeterParams) -> float:
    if not (0.0 <= p.p_charge <= 1.0):
        raise ValueError("p_charge out of [0, 1]")
    return _binomial_tail_ge(p.max_respins, p.meter_capacity, p.p_charge)


def analytical_rtp(p: RespinChargeMeterParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.meter_capacity <= 0:
        raise ValueError("meter_capacity must be > 0")
    if p.max_respins <= 0:
        raise ValueError("max_respins must be > 0")
    return p.p_trigger * prob_fill(p) * p.fill_pay


def mc_simulate(p: RespinChargeMeterParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    fills = 0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        charges = 0
        for _ in range(p.max_respins):
            if rng.random() < p.p_charge:
                charges += 1
                if charges >= p.meter_capacity:
                    break
        if charges >= p.meter_capacity:
            fills += 1
            total += p.fill_pay
    return {
        "rtp_mc": total / max(spins, 1),
        "fill_rate": fills / max(triggers, 1),
        "trigger_rate": triggers / max(spins, 1),
    }

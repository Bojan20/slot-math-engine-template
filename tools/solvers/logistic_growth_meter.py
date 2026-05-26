"""Closed-form kernel — Logistic-Growth Meter.

Industry pattern (Big Time Gaming "Cosmic Meter" that fills along
an S-curve): meter level after k charges follows logistic growth:

  L(k) = K / (1 + exp(-r · (k - k0)))

The kernel returns expected meter level after `charges` increments
and probability the meter reaches a designer-specified threshold
within `charges`.

Per-trigger uplift:
  uplift = p_trigger · expected_pay(meter_level)
where expected_pay is linear in meter_level (designer-specified slope).
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class LogisticMeterParams:
    p_trigger: float
    K_capacity: float
    r_growth: float
    k0_midpoint: float
    charges: int
    pay_per_unit: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def meter_level(p: LogisticMeterParams, k: float) -> float:
    if p.K_capacity <= 0:
        raise ValueError("K_capacity must be > 0")
    if p.r_growth <= 0:
        raise ValueError("r_growth must be > 0")
    return p.K_capacity / (1.0 + math.exp(-p.r_growth * (k - p.k0_midpoint)))


def expected_pay(p: LogisticMeterParams) -> float:
    return meter_level(p, p.charges) * p.pay_per_unit


def analytical_rtp(p: LogisticMeterParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    return p.p_trigger * expected_pay(p)


def mc_simulate(p: LogisticMeterParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    """Stochastic: charges arrive jittered by Poisson(1) per slot."""
    rng = random.Random(seed)
    total = 0.0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        # Poisson-jittered charge count (approximate)
        k = sum(1 for _ in range(p.charges) if rng.random() < 0.95)
        level = meter_level(p, k)
        total += level * p.pay_per_unit
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }

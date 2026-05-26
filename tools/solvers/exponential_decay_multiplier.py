"""Closed-form kernel — Exponential Decay Multiplier.

Industry pattern (Big Time Gaming "Win Boost" decaying multiplier
during respins; each respin the multiplier shrinks by `decay`
multiplicatively): multiplier on respin k is m_0 · decay^(k-1).

Closed-form expected multiplier across N respins:
  E[total mult] = m_0 · (1 - decay^N) / (1 - decay)   if decay < 1
  E[total mult] = N · m_0                              if decay == 1

If trigger fires with prob `p_trigger`:
  uplift = p_trigger · base_pay · E[total mult]
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class ExpDecayMultParams:
    p_trigger: float
    m_initial: float
    decay: float                  # multiplier shrinkage factor ∈ (0, 1]
    n_respins: int
    base_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_total_multiplier(p: ExpDecayMultParams) -> float:
    if not (0.0 < p.decay <= 1.0):
        raise ValueError("decay must be in (0, 1]")
    if p.n_respins < 0:
        raise ValueError("n_respins must be >= 0")
    if p.decay == 1.0:
        return p.n_respins * p.m_initial
    return p.m_initial * (1.0 - p.decay ** p.n_respins) / (1.0 - p.decay)


def analytical_rtp(p: ExpDecayMultParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    return p.p_trigger * p.base_pay * expected_total_multiplier(p)


def mc_simulate(p: ExpDecayMultParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        m = p.m_initial
        for _ in range(p.n_respins):
            total += p.base_pay * m
            m *= p.decay
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }

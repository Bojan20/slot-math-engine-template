"""Closed-form kernel — Weibull Session-Length.

Industry pattern (player session-length / churn modeling):
session length T follows Weibull(shape=k, scale=lambda). Expected
session length = lambda · Γ(1 + 1/k).

Operator expected per-session value:
  uplift = E[T] · mean_rtp_per_spin · bet
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class WeibullSessionParams:
    shape_k: float
    scale_lambda: float
    mean_rtp_per_spin: float
    bet_per_spin: float = 1.0


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_session_length(p: WeibullSessionParams) -> float:
    if p.shape_k <= 0:
        raise ValueError("shape_k must be > 0")
    if p.scale_lambda <= 0:
        raise ValueError("scale_lambda must be > 0")
    return p.scale_lambda * math.gamma(1.0 + 1.0 / p.shape_k)


def analytical_rtp(p: WeibullSessionParams) -> float:
    """Return expected session-level RTP × per-spin RTP × E[T]."""
    return p.mean_rtp_per_spin * expected_session_length(p) * p.bet_per_spin


def mc_simulate(p: WeibullSessionParams, sessions: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    lengths: list[float] = []
    for _ in range(sessions):
        u = rng.random()
        # Weibull inverse CDF: T = lambda · (-ln(1-u))^(1/k)
        t = p.scale_lambda * ((-math.log(max(1 - u, 1e-12))) ** (1.0 / p.shape_k))
        lengths.append(t)
        total += t * p.mean_rtp_per_spin * p.bet_per_spin
    return {
        "rtp_mc": total / max(sessions, 1),
        "avg_session_length": sum(lengths) / max(sessions, 1),
    }

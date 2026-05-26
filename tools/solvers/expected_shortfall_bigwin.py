"""Closed-form kernel — Conditional Tail Expectation (CVaR / Expected Shortfall).

Regulatory pattern (jurisdictions that require a posted "average
big win" or "tail conditional mean"): given a payout distribution
expressed as histogram bins (pay, prob), compute:

  • VaR_{alpha}: smallest pay v such that P(pay >= v) <= 1 - alpha
  • CVaR_{alpha}: E[pay | pay >= VaR_{alpha}]

The kernel works over discrete histograms (binomial / multinomial
empirical outputs).
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class ExpectedShortfallParams:
    pay_bins: list[tuple[float, float]]   # [(pay_value, prob_mass), ...]
    alpha: float = 0.95


ACCEPTANCE_TOLERANCE_MC = 0.05


def _normalize(bins: list[tuple[float, float]]) -> list[tuple[float, float]]:
    s = sum(p for _, p in bins)
    if s <= 0:
        raise ValueError("probabilities must sum to > 0")
    return [(v, p / s) for v, p in bins]


def var_at_level(p: ExpectedShortfallParams) -> float:
    """Smallest pay v such that cumulative tail prob ≥ 1 - alpha."""
    if not (0.0 < p.alpha < 1.0):
        raise ValueError("alpha must be in (0, 1)")
    bins = sorted(_normalize(p.pay_bins), key=lambda x: x[0])
    # Sum probabilities from highest pay downward
    tail = 0.0
    target = 1.0 - p.alpha
    for v, pr in reversed(bins):
        tail += pr
        if tail >= target:
            return v
    return bins[0][0]


def cvar(p: ExpectedShortfallParams) -> float:
    """E[pay | pay >= VaR]."""
    v = var_at_level(p)
    bins = _normalize(p.pay_bins)
    tail_weight = 0.0
    weighted_sum = 0.0
    for pay, pr in bins:
        if pay >= v:
            weighted_sum += pay * pr
            tail_weight += pr
    if tail_weight <= 0:
        return v
    return weighted_sum / tail_weight


def analytical_rtp(p: ExpectedShortfallParams) -> float:
    """Returns mean pay (not RTP per se — this kernel exposes tail metrics)."""
    bins = _normalize(p.pay_bins)
    return sum(pay * pr for pay, pr in bins)


def mc_simulate(p: ExpectedShortfallParams, samples: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    bins = _normalize(p.pay_bins)
    cdf = []
    acc = 0.0
    for _, pr in bins:
        acc += pr
        cdf.append(acc)
    samples_drawn = []
    for _ in range(samples):
        r = rng.random()
        for i, c in enumerate(cdf):
            if r < c:
                samples_drawn.append(bins[i][0])
                break
    samples_drawn.sort()
    var_pos = int((1.0 - (1.0 - p.alpha)) * len(samples_drawn))
    var_mc = samples_drawn[min(var_pos, len(samples_drawn) - 1)]
    tail = [x for x in samples_drawn if x >= var_mc]
    cvar_mc = sum(tail) / max(len(tail), 1)
    return {
        "rtp_mc": sum(samples_drawn) / max(samples, 1),
        "var_mc": var_mc,
        "cvar_mc": cvar_mc,
    }

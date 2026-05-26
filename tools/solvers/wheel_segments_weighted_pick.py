"""Closed-form kernel — Wheel Segments Weighted Pick.

Industry pattern (Mega Wheel, Lightning Roulette wheel sectors):
on trigger, a wheel with N segments is spun once; each segment has
weight w_i and pay v_i. RTP per trigger = Σ w_i · v_i / Σ w_i.

Generalizes to multi-spin wheels (`n_spins > 1`) with independent
draws → expected total payout = n_spins · expected_per_spin.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class WheelSegmentsParams:
    p_trigger: float
    segment_weights: list[float]
    segment_values: list[float]
    n_spins: int = 1


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_per_spin(p: WheelSegmentsParams) -> float:
    if len(p.segment_weights) != len(p.segment_values):
        raise ValueError("weights/values length mismatch")
    if not p.segment_weights:
        return 0.0
    total_w = sum(p.segment_weights)
    if total_w <= 0:
        raise ValueError("weights must sum to > 0")
    return sum(w * v for w, v in zip(p.segment_weights, p.segment_values)) / total_w


def analytical_rtp(p: WheelSegmentsParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.n_spins < 0:
        raise ValueError("n_spins must be >= 0")
    return p.p_trigger * p.n_spins * expected_per_spin(p)


def mc_simulate(p: WheelSegmentsParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_w = sum(p.segment_weights)
    cdf: list[float] = []
    acc = 0.0
    for w in p.segment_weights:
        acc += w
        cdf.append(acc)
    total = 0.0
    fires = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        fires += 1
        for _ in range(p.n_spins):
            r = rng.random() * total_w
            for i, c in enumerate(cdf):
                if r < c:
                    total += p.segment_values[i]
                    break
    return {
        "rtp_mc": total / max(spins, 1),
        "fire_rate": fires / max(spins, 1),
    }

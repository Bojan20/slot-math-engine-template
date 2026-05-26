"""Closed-form kernel — Mystery Box Award Table.

Industry pattern (Big Time Gaming Mystery, Yggdrasil Mystery Reels):
a mystery box appears with probability `p_box`. On reveal, weighted
random draw from an award table yields:
  - cash multiplier × bet (most common)
  - free-spins trigger
  - jackpot tier

Closed-form RTP contribution from boxes:
  E[box_value] = Σ_i w_i · v_i / Σ w_i
  uplift_per_spin = p_box · E[box_value]

Multiple independent boxes per spin (Binomial(n_cells, p_box_per_cell))
generalize linearly because awards are independent.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class MysteryBoxParams:
    n_cells: int
    p_box_per_cell: float
    award_values: list[float]
    award_weights: list[float]


ACCEPTANCE_TOLERANCE_MC = 0.05


def _expected_award(values: list[float], weights: list[float]) -> float:
    if len(values) != len(weights):
        raise ValueError("values/weights length mismatch")
    if not values:
        return 0.0
    total_w = sum(weights)
    if total_w <= 0:
        raise ValueError("weights must sum to > 0")
    return sum(v * w for v, w in zip(values, weights)) / total_w


def analytical_rtp(p: MysteryBoxParams) -> float:
    if not (0.0 <= p.p_box_per_cell <= 1.0):
        raise ValueError("p_box_per_cell out of [0, 1]")
    if p.n_cells <= 0:
        raise ValueError("n_cells must be > 0")
    ev_award = _expected_award(p.award_values, p.award_weights)
    expected_boxes = p.n_cells * p.p_box_per_cell
    return expected_boxes * ev_award


def mc_simulate(p: MysteryBoxParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    boxes_total = 0
    total_w = sum(p.award_weights)
    cumulative = []
    acc = 0.0
    for w in p.award_weights:
        acc += w
        cumulative.append(acc)
    for _ in range(spins):
        boxes = 0
        for _ in range(p.n_cells):
            if rng.random() < p.p_box_per_cell:
                boxes += 1
        for _ in range(boxes):
            r = rng.random() * total_w
            for i, c in enumerate(cumulative):
                if r < c:
                    total += p.award_values[i]
                    break
        boxes_total += boxes
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_boxes_per_spin": boxes_total / max(spins, 1),
    }

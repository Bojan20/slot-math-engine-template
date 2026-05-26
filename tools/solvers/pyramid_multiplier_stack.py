"""Closed-form kernel — Pyramid Multiplier Stack.

Industry pattern (Push Gaming Mystery Stacks, Pragmatic Magic Pot
multipliers): each grid row has a base multiplier that escalates
by `mult_step` from bottom to top. Wins on a row are paid × that
row's multiplier.

For a uniform row-pay base rate `row_hit_freq` and base row pay
`row_pay`:

  E[per-row payout] = row_hit_freq · row_pay · row_multiplier(r)
  E[per-spin payout] = Σ_{r=0..rows-1} row_hit_freq · row_pay
                                       · (mult_base + r · mult_step)

  = row_hit_freq · row_pay · rows · (mult_base + mult_step · (rows-1)/2)
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class PyramidMultiplierParams:
    rows: int
    row_hit_freq: float
    row_pay: float
    mult_base: float
    mult_step: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_average_multiplier(p: PyramidMultiplierParams) -> float:
    if p.rows <= 0:
        return 0.0
    # arithmetic mean of base, base+step, base+2*step, …, base+(rows-1)*step
    return p.mult_base + p.mult_step * (p.rows - 1) / 2.0


def analytical_rtp(p: PyramidMultiplierParams) -> float:
    if not (0.0 <= p.row_hit_freq <= 1.0):
        raise ValueError("row_hit_freq out of [0, 1]")
    if p.rows <= 0:
        raise ValueError("rows must be > 0")
    avg_mult = expected_average_multiplier(p)
    return p.row_hit_freq * p.row_pay * p.rows * avg_mult


def mc_simulate(p: PyramidMultiplierParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    for _ in range(spins):
        for r in range(p.rows):
            if rng.random() < p.row_hit_freq:
                m = p.mult_base + r * p.mult_step
                total += p.row_pay * m
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_multiplier": expected_average_multiplier(p),
    }

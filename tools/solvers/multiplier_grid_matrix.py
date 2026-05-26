"""Closed-form kernel — Multiplier Grid Matrix (fixed-grid jackpot).

Industry pattern (Playtech Mega Fire Blaze, Pragmatic Hot to Burn
Multiplier, NetEnt Fire & Steel multiplier grid): a fixed N×M grid
of multiplier cells; trigger event "rolls" the grid, summing or
multiplying the visible multipliers. Jackpot tiers correspond to
specific cell combinations.

Closed-form derivation
======================

Let:
  n_cells          = N × M total cells on the multiplier grid
  cell_mult_dist   = {m: P(M_i = m)} per-cell multiplier distribution
                     (typically dominated by 1× with rare 2×/5×/10×/etc.)
  trigger_p        = per-spin probability the grid bonus triggers
  base_pay         = expected base pay × bet on a trigger (factor for
                     the multiplier sum/product result)
  combine_mode     = "sum" (typical) or "product" (rare)
  jackpot_tiers    = optional {threshold: bonus_pay} that adds when
                     the multiplier sum/product exceeds a threshold

Per-cell expected multiplier:
  E[M] = Σ m × P(M=m)

For combine_mode = "sum":
  E[total mult | trigger] = n_cells × E[M]
  Var[total mult | trigger] = n_cells × Var[M]

For combine_mode = "product":
  E[total mult | trigger] = E[M]^n_cells     (iid product MGF)

Unconditional RTP from feature:
  RTP_feat = trigger_p × base_pay × E[total mult | trigger]

Plus jackpot tier contributions if any (computed via threshold CDF).

Acceptance band
===============
EXACT in expectation for sum-mode. Product mode is also exact
in expectation but has higher variance. MC ratio ∈ [0.95, 1.05] @ 30K.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class MultiplierGridParams:
    """Parameters for the multiplier-grid-matrix solver.

    n_cells:         total cells on the grid (N × M)
    cell_mult_dist:  {m: P(M=m)} per-cell multiplier distribution
    trigger_p:       per-spin trigger probability
    base_pay:        expected pay × bet on trigger (multiplied by the
                     grid result)
    combine_mode:    "sum" or "product"
    """

    n_cells: int
    cell_mult_dist: Mapping[float, float]
    trigger_p: float
    base_pay: float
    combine_mode: str = "sum"


def expected_cell_multiplier(p: MultiplierGridParams) -> float:
    """E[M] = Σ m × P(M=m)."""
    return sum(m * pr for m, pr in p.cell_mult_dist.items())


def variance_cell_multiplier(p: MultiplierGridParams) -> float:
    """Var[M] = E[M²] − E[M]²."""
    e_m = expected_cell_multiplier(p)
    e_m2 = sum((m ** 2) * pr for m, pr in p.cell_mult_dist.items())
    return e_m2 - e_m * e_m


def expected_total_multiplier(p: MultiplierGridParams) -> float:
    """E[Σ M_i] = n × E[M] for sum mode; E[Π M_i] = E[M]^n for product."""
    e_m = expected_cell_multiplier(p)
    if p.combine_mode == "product":
        return e_m ** p.n_cells
    return p.n_cells * e_m


def analytical_rtp(p: MultiplierGridParams) -> float:
    """RTP = trigger_p × base_pay × E[total mult]."""
    return p.trigger_p * p.base_pay * expected_total_multiplier(p)


def mc_simulate(
    p: MultiplierGridParams,
    spins: int = 30_000,
    seed: int = 42,
) -> dict:
    """MC — Bernoulli trigger, then iid draws from cell_mult_dist."""
    rng = random.Random(seed)
    items = list(p.cell_mult_dist.items())
    cum = []
    acc = 0.0
    for m, pr in items:
        acc += pr
        cum.append((m, acc))
    total = cum[-1][1] if cum else 1.0

    def _draw() -> float:
        x = rng.random() * total
        for m, c in cum:
            if x <= c:
                return m
        return cum[-1][0] if cum else 1.0

    total_pay = 0.0
    hits = 0
    for _ in range(spins):
        if rng.random() >= p.trigger_p:
            continue
        if p.combine_mode == "product":
            t = 1.0
            for _ in range(p.n_cells):
                t *= _draw()
        else:
            t = 0.0
            for _ in range(p.n_cells):
                t += _draw()
        total_pay += p.base_pay * t
        hits += 1
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "hit_freq": hits / max(spins, 1),
    }

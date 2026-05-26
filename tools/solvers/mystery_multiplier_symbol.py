"""Closed-form kernel — Mystery Multiplier Symbol.

Industry pattern (Pragmatic Sweet Bonanza Money Wild / Hacksaw
Wanted Dead "Mystery Mult" / Vendor B Money Storm): a mystery symbol
lands on the grid with probability `p_land_per_cell`. When ≥1 mystery
symbol contributes to a win line, all the mystery symbols on the
grid reveal as a single multiplier drawn iid from `mult_dist`. The
final pay = base_win × Π M_i (product of multipliers).

Closed-form (single trigger per spin)
=====================================

Let:
  n_cells = reels × rows
  p = p_land_per_cell
  E[M]    = Σ p_v × v
  base_rtp = baseline line-eval RTP

Per-spin expected number of mystery symbols K ~ Binomial(n_cells, p).
Multiplicative expectation under product-of-iid-multipliers:
  E[Π M | K = k] = E[M]^k
Marginalizing over K:
  E[Π M] = Σ_{k=0..n_cells} C(n_cells, k) p^k (1-p)^(n_cells-k) × E[M]^k
         = ((1 - p) + p × E[M])^n_cells              (MGF identity)

Net per-spin RTP uplift over baseline:
  RTP_total = base_rtp × E[Π M]

Acceptance band
===============

EXACT in expectation under independence. MC ratio [0.95, 1.05] @ 100K.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class MysteryMultParams:
    reels: int
    rows: int
    p_land_per_cell: float
    mult_dist: Mapping[float, float]   # {multiplier: prob}, Σ p = 1
    base_line_rtp: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_multiplier(p: MysteryMultParams) -> float:
    return sum(float(v) * float(pv) for v, pv in p.mult_dist.items())


def analytical_rtp(p: MysteryMultParams) -> float:
    if not (0.0 <= p.p_land_per_cell <= 1.0):
        raise ValueError("p_land_per_cell out of [0, 1]")
    n_cells = p.reels * p.rows
    em = expected_multiplier(p)
    e_prod = ((1.0 - p.p_land_per_cell) + p.p_land_per_cell * em) ** n_cells
    return p.base_line_rtp * e_prod


def mc_simulate(p: MysteryMultParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    n_cells = p.reels * p.rows
    multipliers = list(p.mult_dist.keys())
    weights = [p.mult_dist[k] for k in multipliers]
    total = 0.0
    for _ in range(spins):
        prod = 1.0
        for _i in range(n_cells):
            if rng.random() < p.p_land_per_cell:
                prod *= rng.choices(multipliers, weights=weights, k=1)[0]
        total += p.base_line_rtp * prod
    return {
        "rtp_mc": total / max(spins, 1),
    }

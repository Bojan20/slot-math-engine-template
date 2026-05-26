"""Closed-form kernel — Anywhere-Pays (Binomial over visible grid).

Industry pattern (NetEnt Aloha Cluster Pays, Pragmatic Magic Money
Maze, Vendor F "Pay Anywhere", IGT Pixies of the Forest): a target
symbol pays when it appears ≥N times anywhere on the visible
`reels × rows` grid, regardless of payline alignment. Pay scales
with count (e.g. {N: 5, N+1: 10, N+2: 25, …}).

Closed-form
===========

Let:
  reels, rows       = grid dimensions
  n_cells = reels × rows
  p_X       = per-cell probability of the target symbol (assumes
              i.i.d. across cells — true under uniform-strip sampling)
  pay_table = {k: pay_k} for k ≥ min_match
  max_k    = largest k in pay_table (cap)

Number of target symbols on a spin is Binomial(n_cells, p_X). Per-spin
expected pay:

  E[pay] = Σ_{k=min_match..max_k} C(n_cells, k) × p_X^k × (1 − p_X)^(n_cells − k)
           × pay_table[k]

Acceptance band
===============

EXACT in expectation at 200K MC spins (independence assumption
matches the closed form). MC ratio expected in [0.95, 1.05].
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class AnywherePaysParams:
    reels: int
    rows: int
    p_target_per_cell: float
    pay_table: Mapping[int, float]    # {k: pay_k} for k ≥ min_match
    min_match: int = 3


ACCEPTANCE_TOLERANCE_MC = 0.02


def _binom_pmf(n: int, k: int, p: float) -> float:
    if k < 0 or k > n:
        return 0.0
    return math.comb(n, k) * (p ** k) * ((1 - p) ** (n - k))


def analytical_rtp(p: AnywherePaysParams) -> float:
    if p.reels <= 0 or p.rows <= 0:
        raise ValueError("dimensions must be positive")
    if not (0.0 <= p.p_target_per_cell <= 1.0):
        raise ValueError("p_target_per_cell out of [0, 1]")
    if not p.pay_table:
        return 0.0
    n_cells = p.reels * p.rows
    max_k = max(p.pay_table.keys())
    total = 0.0
    for k in range(p.min_match, max_k + 1):
        pay_k = float(p.pay_table.get(k, 0.0))
        if pay_k <= 0:
            continue
        prob = _binom_pmf(n_cells, k, p.p_target_per_cell)
        total += prob * pay_k
    return total


def mc_simulate(p: AnywherePaysParams, spins: int = 200_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    n_cells = p.reels * p.rows
    pays: list[float] = []
    for _ in range(spins):
        # Sample number of target symbols this spin via direct
        # Bernoulli rolls across grid cells (independence model).
        k = sum(1 for _i in range(n_cells)
                if rng.random() < p.p_target_per_cell)
        pay = float(p.pay_table.get(k, 0.0)) if k >= p.min_match else 0.0
        pays.append(pay)
    mean = sum(pays) / max(spins, 1)
    return {
        "rtp_mc": mean,
        "mean_count": sum(1 for x in pays if x > 0) / max(spins, 1),
    }

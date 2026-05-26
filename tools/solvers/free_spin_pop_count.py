"""Closed-form kernel — Free Spin Pop Count (scatter Binomial).

Industry pattern (NetEnt Starburst Free Spins / Pragmatic Bigger
Bass / Vendor A Triple Diamond): N scatters anywhere on the grid
trigger free spins; payout per trigger comes from `award_by_count`.

Closed-form
===========

K ~ Binomial(n_cells, p_scatter). For each count k ≥ min_trigger,
award = award_by_count[k] (clamped to top tier).

Expected per-spin free-spin contribution:
  E[FS_contrib] = Σ_k P(K = k) × award_k × rtp_per_fs_spin
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class FreeSpinPopParams:
    reels: int
    rows: int
    p_scatter_per_cell: float
    min_trigger: int
    award_by_count: Mapping[int, int]   # {scatters: free_spins_awarded}
    rtp_per_fs_spin: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _binom_pmf(n: int, k: int, p: float) -> float:
    if k < 0 or k > n:
        return 0.0
    return math.comb(n, k) * (p ** k) * ((1 - p) ** (n - k))


def expected_award(p: FreeSpinPopParams) -> float:
    if not p.award_by_count:
        return 0.0
    n_cells = p.reels * p.rows
    max_k = max(p.award_by_count.keys())
    total = 0.0
    for k in range(p.min_trigger, n_cells + 1):
        award = p.award_by_count.get(min(k, max_k), 0)
        prob = _binom_pmf(n_cells, k, p.p_scatter_per_cell)
        total += prob * award
    return total


def analytical_rtp(p: FreeSpinPopParams) -> float:
    if not (0.0 <= p.p_scatter_per_cell <= 1.0):
        raise ValueError("p_scatter_per_cell out of [0, 1]")
    if p.min_trigger < 1:
        raise ValueError("min_trigger must be ≥ 1")
    return expected_award(p) * p.rtp_per_fs_spin


def mc_simulate(p: FreeSpinPopParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    n_cells = p.reels * p.rows
    max_k = max(p.award_by_count.keys()) if p.award_by_count else 0
    triggers = 0
    total = 0.0
    for _ in range(spins):
        k = sum(1 for _i in range(n_cells)
                if rng.random() < p.p_scatter_per_cell)
        if k >= p.min_trigger:
            triggers += 1
            award = p.award_by_count.get(min(k, max_k), 0)
            total += award * p.rtp_per_fs_spin
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }

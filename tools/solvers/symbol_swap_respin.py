"""Closed-form kernel — Symbol Swap Respin.

Industry pattern (Hacksaw Le Bandit / Vendor A Mystery Wins /
Pragmatic Big Bass): on a losing spin, with probability `p_swap`,
one random cell is swapped to a chosen `target_symbol`. If this
turns the spin into a win, the win pays. Net effect is a guaranteed-
near-miss recovery feature.

Closed-form
===========

Per losing spin:
  P(swap_fires) = p_swap
  P(swap leads to win) ≈ (mean fraction of cells that, if changed
                          to target, complete a 5-OAK line)
                       ≈ p_recovery_per_cell × n_cells
                          (calibrated, dataset-dependent)

Per-spin uplift:
  uplift = p_loss × p_swap × p_recovery_per_cell × n_cells × win_pay

where p_loss = 1 - base_hit_freq.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class SymbolSwapParams:
    base_hit_freq: float
    p_swap: float                 # P(swap fires given losing spin)
    p_recovery_per_cell: float    # P(a cell swap completes a win)
    n_cells: int
    avg_recovery_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def analytical_rtp(p: SymbolSwapParams) -> float:
    if not (0.0 <= p.base_hit_freq <= 1.0):
        raise ValueError("base_hit_freq out of [0, 1]")
    if not (0.0 <= p.p_swap <= 1.0):
        raise ValueError("p_swap out of [0, 1]")
    p_loss = 1.0 - p.base_hit_freq
    p_recovery = min(1.0, p.p_recovery_per_cell * p.n_cells)
    return p_loss * p.p_swap * p_recovery * p.avg_recovery_pay


def mc_simulate(p: SymbolSwapParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    triggers = 0
    p_recovery_total = min(1.0, p.p_recovery_per_cell * p.n_cells)
    for _ in range(spins):
        # Base spin outcome
        if rng.random() < p.base_hit_freq:
            continue
        if rng.random() >= p.p_swap:
            continue
        triggers += 1
        if rng.random() < p_recovery_total:
            total += p.avg_recovery_pay
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
    }

"""Closed-form kernel — Lock & Reload Jackpot.

Industry pattern (Aristocrat Lightning Link / Dragon Link
Lock-and-Reload free spins): on bonus trigger, a "lock" symbol
appears at probability `p_lock_per_cell` for each of `n_cells`
across `reload_spins` reloads. Final pay = base_per_lock × total
locked cells, plus a `grand_threshold` bonus if all cells filled.

Closed-form
===========

Per cell across the bonus:
  P(any lock across reload_spins) = 1 - (1 - p)^reload_spins
  E[locked cells] = n_cells · (1 - (1 - p)^reload_spins)

Grand jackpot:
  P(all locked) = (1 - (1 - p)^reload_spins)^n_cells

uplift = p_trigger · (E[locked] · base_per_lock + P(all) · grand_bonus)
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class LockAndReloadParams:
    p_trigger: float
    n_cells: int
    p_lock_per_cell: float
    reload_spins: int
    base_per_lock: float
    grand_bonus: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _prob_cell_locked(p_cell: float, n_reloads: int) -> float:
    if not (0.0 <= p_cell <= 1.0):
        raise ValueError("p_lock_per_cell out of [0, 1]")
    if n_reloads <= 0:
        return 0.0
    return 1.0 - (1.0 - p_cell) ** n_reloads


def analytical_rtp(p: LockAndReloadParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.n_cells <= 0:
        raise ValueError("n_cells must be > 0")
    p_cell = _prob_cell_locked(p.p_lock_per_cell, p.reload_spins)
    e_locked = p.n_cells * p_cell
    p_all = p_cell ** p.n_cells
    return p.p_trigger * (e_locked * p.base_per_lock + p_all * p.grand_bonus)


def mc_simulate(p: LockAndReloadParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    grand_hits = 0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        locked = [False] * p.n_cells
        for _ in range(p.reload_spins):
            for i in range(p.n_cells):
                if not locked[i] and rng.random() < p.p_lock_per_cell:
                    locked[i] = True
        n_locked = sum(locked)
        total += n_locked * p.base_per_lock
        if n_locked == p.n_cells:
            grand_hits += 1
            total += p.grand_bonus
    return {
        "rtp_mc": total / max(spins, 1),
        "grand_rate": grand_hits / max(triggers, 1),
    }

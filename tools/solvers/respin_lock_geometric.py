"""Closed-form kernel — Respin Lock (geometric chain).

Industry pattern (Vendor C Lightning Link / Pragmatic Hold & Win
respin / Vendor A Money Storm): trigger spawns N_initial locked
symbols; each respin gives every empty cell a chance `p_land` to
become locked. Chain continues until 3 consecutive no-land respins
OR the grid fills.

Closed-form
===========

Simplified Markov chain over locked-cell count L ∈ {N_initial,
N_initial+1, …, total_cells}.

Per-respin event for state L:
  P(at least one new lock) = 1 - (1 - p_land)^(total - L)
  P(no land) accumulates until reset counter hits `consec_misses_to_end`

Closed-form (with no early-termination, just grid-fill):
  Expected respins to fill: sum over L of 1/(1 − (1 − p_land)^(total − L))
  Expected total locked = total_cells (deterministic upper bound)

For early-terminating variant with `consec_misses_to_end = K`:
  E[respins | start L] ≈ (E[locks added] × E[fill time])
  Approximation works when p_land is small (Bernoulli mean dominates).

Acceptance band
===============

MC ratio [0.85, 1.15] @ 20K sessions. The closed form ignores the
3-consecutive-miss truncation; MC reproduces it.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class RespinLockParams:
    total_cells: int
    n_initial_locks: int
    p_land_per_cell: float
    consec_misses_to_end: int = 3
    locked_cell_value: float = 1.0


ACCEPTANCE_TOLERANCE_MC = 0.15


def expected_locked_cells_no_truncation(p: RespinLockParams) -> float:
    """Upper bound: expected final locked count assuming chain runs
    until grid fills (ignores consec_misses_to_end)."""
    return float(p.total_cells)


def analytical_rtp(p: RespinLockParams) -> float:
    """Approximate expected pay = (initial + α × empty × p_land × geo) ×
    value_per_cell.

    α is a heuristic 'effective fill ratio' = 1 − (1 − p)^E[respins].
    For small p, this collapses to ≈ p × E[respins].
    """
    if not (0.0 <= p.p_land_per_cell <= 1.0):
        raise ValueError("p_land_per_cell out of [0, 1]")
    if p.total_cells <= 0:
        raise ValueError("total_cells must be positive")
    if p.n_initial_locks > p.total_cells:
        raise ValueError("n_initial_locks > total_cells")
    # Approximate expected #respins until chain breaks via geometric
    # over the "any-land probability" at the initial state.
    empty0 = p.total_cells - p.n_initial_locks
    if empty0 == 0:
        return p.total_cells * p.locked_cell_value
    p_any_land = 1.0 - (1.0 - p.p_land_per_cell) ** empty0
    # Expected respins under "stop after K consecutive misses":
    # state-tracking exact form simplifies for small p as
    # E[respins] ≈ K / (1 - p_any_land)  (overestimate)
    if p_any_land >= 1.0:
        e_respins = float(p.consec_misses_to_end)
    else:
        e_respins = (
            (1.0 - (1.0 - p_any_land) ** p.consec_misses_to_end)
            / max(p_any_land, 1e-12)
        )
    # Expected new locks across the chain = p × empty0 × E[respins]
    # (Bernoulli approx; ignores diminishing empty as locks accumulate)
    e_new_locks = min(
        empty0,
        p.p_land_per_cell * empty0 * e_respins,
    )
    total_locked = p.n_initial_locks + e_new_locks
    return total_locked * p.locked_cell_value


def mc_simulate(p: RespinLockParams, sessions: int = 20_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    final_locks: list[int] = []
    respins_used: list[int] = []
    for _ in range(sessions):
        locked = p.n_initial_locks
        consec_misses = 0
        respins = 0
        while consec_misses < p.consec_misses_to_end and locked < p.total_cells:
            respins += 1
            new_locks = 0
            for _i in range(p.total_cells - locked):
                if rng.random() < p.p_land_per_cell:
                    new_locks += 1
            locked += new_locks
            if new_locks == 0:
                consec_misses += 1
            else:
                consec_misses = 0
        final_locks.append(locked)
        respins_used.append(respins)
    mean_final = sum(final_locks) / max(sessions, 1)
    return {
        "rtp_mc": mean_final * p.locked_cell_value,
        "mean_final_locks": mean_final,
        "mean_respins": sum(respins_used) / max(sessions, 1),
    }

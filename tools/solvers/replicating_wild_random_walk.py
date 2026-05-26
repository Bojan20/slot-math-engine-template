"""Closed-form kernel — Replicating Wild Random Walk.

Industry pattern (NetEnt Wild-Wild-West, Pragmatic Wild Walker):
each spin a wild on the grid replicates to an adjacent cell with
probability `p_step`, repeating up to `max_steps` times. Each newly
created wild stays for the current spin.

Closed-form
===========

Number of new wilds produced per starting wild follows a truncated
geometric chain:
  E[new_wilds | one seed] = Σ_{k=1..K} k · p_step^k · (1 - p_step)
                            + K · p_step^K   (truncated at K=max_steps)

For W seed wilds (Binomial with E[W] = n_cells · p_wild_seed):
  E[total_wilds] = E[W] · (1 + E[chain])

Per-spin uplift over a base RTP that scales linearly with wild count
in the relevant denominator window:
  uplift_per_spin = E[total_wilds] · marginal_pay_per_wild
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class ReplicatingWildParams:
    n_cells: int
    p_wild_seed: float          # P(any cell is a seed wild)
    p_step: float               # P(replication step succeeds)
    max_steps: int              # cap on chain length per seed
    marginal_pay_per_wild: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _chain_expectation(p_step: float, max_steps: int) -> float:
    if not (0.0 <= p_step <= 1.0):
        raise ValueError("p_step out of [0, 1]")
    if max_steps < 0:
        raise ValueError("max_steps must be >= 0")
    if p_step == 0.0 or max_steps == 0:
        return 0.0
    # E[chain] = Σ p_step^k for k=1..max_steps
    # Closed-form geometric partial sum:
    if p_step == 1.0:
        return float(max_steps)
    return p_step * (1.0 - p_step ** max_steps) / (1.0 - p_step)


def analytical_rtp(p: ReplicatingWildParams) -> float:
    if not (0.0 <= p.p_wild_seed <= 1.0):
        raise ValueError("p_wild_seed out of [0, 1]")
    if p.n_cells <= 0:
        raise ValueError("n_cells must be > 0")
    expected_seeds = p.n_cells * p.p_wild_seed
    chain = _chain_expectation(p.p_step, p.max_steps)
    expected_total = expected_seeds * (1.0 + chain)
    return expected_total * p.marginal_pay_per_wild


def mc_simulate(p: ReplicatingWildParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    wilds_total = 0
    for _ in range(spins):
        seeds = 0
        for _ in range(p.n_cells):
            if rng.random() < p.p_wild_seed:
                seeds += 1
        all_wilds = seeds
        for _ in range(seeds):
            for _ in range(p.max_steps):
                if rng.random() < p.p_step:
                    all_wilds += 1
                else:
                    break
        total += all_wilds * p.marginal_pay_per_wild
        wilds_total += all_wilds
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_wilds_per_spin": wilds_total / max(spins, 1),
    }

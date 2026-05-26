"""Closed-form kernel — Scatter-Pay Bonus Chain.

Industry pattern (Pragmatic Sticky Bandits / Hacksaw Stack 'em /
Vendor F Wheel-of-Wheels): scatter symbols pay independently of
paylines (sum-of-scatters). Each scatter that lands triggers an
independent Bernoulli check to also enter a bonus chain; the chain
runs `chain_length` rounds with a `chain_pay` accumulator.

Closed-form
===========

Per-spin:
  • Number of scatters K ~ Binomial(n_cells, p_scatter)
  • Scatter pay: E[scatter_pay] = n × p × scatter_pay_per_scatter
  • Bonus chain trigger: each scatter independently triggers with
    probability `p_bonus_per_scatter`. Probability of at least one
    bonus trigger ≈ 1 − (1 − p_bonus)^K.
  • Conditional on trigger, chain pays `chain_length × chain_pay`.

Total RTP:
  RTP = E[scatter_pay] + p_chain_per_spin × chain_length × chain_pay

  where p_chain_per_spin = E[1 − (1 − q)^K]
                         = 1 − ((1 − p × q + p × (1 − q))^n)
                         where p = p_scatter, q = p_bonus, n = n_cells

Acceptance band
===============

EXACT in expectation under independence. MC ratio [0.95, 1.05].
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class ScatterChainParams:
    reels: int
    rows: int
    p_scatter_per_cell: float
    scatter_pay_per_scatter: float
    p_bonus_per_scatter: float
    chain_length: int
    chain_pay_per_step: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _prob_at_least_one_bonus(p: ScatterChainParams) -> float:
    n = p.reels * p.rows
    ps = p.p_scatter_per_cell
    pb = p.p_bonus_per_scatter
    # Per cell: P(no contribution to bonus) = (1 - ps) + ps × (1 - pb)
    p_no = (1.0 - ps) + ps * (1.0 - pb)
    return 1.0 - p_no ** n


def expected_scatter_pay(p: ScatterChainParams) -> float:
    n = p.reels * p.rows
    return n * p.p_scatter_per_cell * p.scatter_pay_per_scatter


def analytical_rtp(p: ScatterChainParams) -> float:
    if not (0.0 <= p.p_scatter_per_cell <= 1.0):
        raise ValueError("p_scatter_per_cell out of [0, 1]")
    if not (0.0 <= p.p_bonus_per_scatter <= 1.0):
        raise ValueError("p_bonus_per_scatter out of [0, 1]")
    if p.chain_length < 0:
        raise ValueError("chain_length must be non-negative")
    p_chain = _prob_at_least_one_bonus(p)
    return expected_scatter_pay(p) + p_chain * p.chain_length * p.chain_pay_per_step


def mc_simulate(p: ScatterChainParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    n = p.reels * p.rows
    total = 0.0
    bonus_triggers = 0
    for _ in range(spins):
        scatters = 0
        any_bonus = False
        for _i in range(n):
            if rng.random() < p.p_scatter_per_cell:
                scatters += 1
                if rng.random() < p.p_bonus_per_scatter:
                    any_bonus = True
        total += scatters * p.scatter_pay_per_scatter
        if any_bonus:
            bonus_triggers += 1
            total += p.chain_length * p.chain_pay_per_step
    return {
        "rtp_mc": total / max(spins, 1),
        "bonus_trigger_rate": bonus_triggers / max(spins, 1),
    }

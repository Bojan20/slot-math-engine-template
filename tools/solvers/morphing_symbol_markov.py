"""Closed-form kernel — Morphing Symbol Markov Chain.

Industry pattern (Vendor C Pixies of the Forest "respin transforms",
Reactoonz "symbol charging", Hacksaw Wanted Dead morphing wilds): a
symbol on the grid morphs through a sequence of upgrades — L1 → L2 →
L3 → … → L_max — with per-step transition probability p_up. At each
level the symbol carries a different pay multiplier.

Closed-form derivation
======================

Let:
  n_levels        = number of upgrade tiers
  p_up            = per-respin upgrade transition probability
                    (Markov chain step)
  level_pays      = [pay_L1, pay_L2, …, pay_Ln] expected pay × bet at
                    each tier
  p_trigger       = per-spin probability the morphing event triggers
  initial_level   = starting level (typ. 1)

We model the level reached after K respins. Each respin promotes with
prob p_up; chain terminates either on cap (max level) or on first
miss (Bernoulli stopping = bounded chain on the cap).

For a simple Markov-stop model (chain promotes until first miss):
  P(reach level L) = p_up^(L − initial_level) × (1 − p_up)
                    for L < n_levels
  P(reach level n_levels) = p_up^(n_levels − initial_level)

Expected pay given trigger:
  E[pay | trigger] = Σ_(L=initial..n_levels) P(reach L) × pay_L

Unconditional:
  RTP = p_trigger × E[pay | trigger]

Acceptance band
===============
EXACT under Markov-stop assumption. MC ratio ∈ [0.95, 1.05] @ 30K
triggers.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Sequence


@dataclass
class MorphingSymbolMarkovParams:
    """Parameters for the morphing-symbol-Markov solver.

    p_trigger:     per-spin trigger probability
    p_up:          per-respin upgrade transition probability
    level_pays:    [pay_L1, pay_L2, …, pay_Ln] × bet
    initial_level: starting tier (0-indexed)
    """

    p_trigger: float
    p_up: float
    level_pays: Sequence[float]
    initial_level: int = 0


def level_distribution(p: MorphingSymbolMarkovParams) -> list[float]:
    """P(reach level L) — chain promotes p_up, stops on first miss
    OR cap."""
    n = len(p.level_pays)
    if p.initial_level >= n:
        return [0.0] * n
    out = [0.0] * n
    if p.p_up <= 0:
        out[p.initial_level] = 1.0
        return out
    if p.p_up >= 1:
        out[n - 1] = 1.0
        return out
    for L in range(p.initial_level, n):
        promotes = L - p.initial_level
        if L < n - 1:
            out[L] = (p.p_up ** promotes) * (1.0 - p.p_up)
        else:
            # Cap — absorb all remaining tail probability.
            out[L] = p.p_up ** promotes
    return out


def expected_pay_per_trigger(p: MorphingSymbolMarkovParams) -> float:
    """Σ_L P(reach L) × pay_L."""
    dist = level_distribution(p)
    return sum(d * pay for d, pay in zip(dist, p.level_pays))


def analytical_rtp(p: MorphingSymbolMarkovParams) -> float:
    """RTP = p_trigger × E[pay | trigger]."""
    return p.p_trigger * expected_pay_per_trigger(p)


def mc_simulate(
    p: MorphingSymbolMarkovParams,
    spins: int = 30_000,
    seed: int = 42,
) -> dict:
    """MC — Bernoulli trigger, then Markov chain promotes until miss
    or cap; pay = level_pays[final_level]."""
    rng = random.Random(seed)
    n = len(p.level_pays)
    total_pay = 0.0
    hits = 0
    level_sum = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        L = p.initial_level
        while L < n - 1 and rng.random() < p.p_up:
            L += 1
        total_pay += p.level_pays[L]
        level_sum += L
        hits += 1
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "hit_freq": hits / max(spins, 1),
        "mean_level": level_sum / max(hits, 1),
    }

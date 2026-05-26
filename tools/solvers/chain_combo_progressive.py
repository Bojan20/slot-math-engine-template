"""Closed-form kernel — Chain Combo Progressive.

Industry pattern (Push Gaming chain-combo + Pragmatic Bigger Bass
Bonanza link bonuses): each win in a session links to the next,
building a combo multiplier that grows additively (`combo_step`) per
linked win up to `combo_cap`. Sessions of linked wins follow a
geometric distribution with continuation probability `p_chain`.

Closed-form
===========

Expected number of linked wins (including the trigger):
  E[N] = 1 / (1 - p_chain)            for p_chain < 1

Combo at the k-th linked win = min(combo_cap, 1 + (k-1) · combo_step).
Expected combo-weighted total per session:

  E[combo_sum] = Σ_{k=1..∞} p_chain^(k-1) · min(combo_cap, 1 + (k-1)·step)

We split the sum into pre-cap and post-cap regimes.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class ChainComboParams:
    p_trigger: float
    p_chain: float
    combo_step: float
    combo_cap: float
    base_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_combo_sum(p_chain: float, combo_step: float,
                       combo_cap: float) -> float:
    if not (0.0 <= p_chain < 1.0):
        if p_chain == 1.0:
            return float("inf")
        raise ValueError("p_chain must be in [0, 1)")
    if combo_step < 0:
        raise ValueError("combo_step must be >= 0")
    if combo_cap < 1.0:
        raise ValueError("combo_cap must be >= 1.0")
    # k_cap = smallest k such that 1 + (k-1)*step >= cap
    if combo_step == 0:
        # constant combo = 1
        return 1.0 / (1.0 - p_chain)
    k_cap = max(1, int(((combo_cap - 1.0) / combo_step) + 1))
    pre = 0.0
    weight = 1.0   # p_chain^(k-1)
    for k in range(1, k_cap + 1):
        combo = min(combo_cap, 1.0 + (k - 1) * combo_step)
        pre += weight * combo
        weight *= p_chain
    # Post-cap: Σ_{k=k_cap+1..∞} p_chain^(k-1) · combo_cap
    #         = combo_cap · p_chain^k_cap / (1 - p_chain)
    post = combo_cap * (p_chain ** k_cap) / (1.0 - p_chain)
    return pre + post


def analytical_rtp(p: ChainComboParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    s = expected_combo_sum(p.p_chain, p.combo_step, p.combo_cap)
    return p.p_trigger * p.base_pay * s


def mc_simulate(p: ChainComboParams, spins: int = 50_000,
                seed: int = 42, max_chain: int = 1000) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    chains: list[int] = []
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        n = 1
        session = 0.0
        while True:
            combo = min(p.combo_cap, 1.0 + (n - 1) * p.combo_step)
            session += p.base_pay * combo
            if rng.random() >= p.p_chain:
                break
            n += 1
            if n >= max_chain:
                break
        chains.append(n)
        total += session
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_chain_length": sum(chains) / max(len(chains), 1),
    }

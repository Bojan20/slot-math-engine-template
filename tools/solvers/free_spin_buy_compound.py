"""Closed-form kernel — Free-Spin Buy + Compound Retrigger.

Industry pattern (Pragmatic Sugar Rush "buy free spins" + retrigger,
Hacksaw bonus buy with chain): player pays cost_x × bet to skip base
game and enter FS directly; once inside, FS spins may retrigger with
geometric ΔK extension. Distinct from `buy_feature_ev` (no retrigger
modeling) and `fs_retrigger_compound` (no buy cost).

Closed-form
===========

  E[T | in FS] = K_0 / (1 − p_re × ΔK)         # branching expectation
  E[pay | in FS] = E[T | in FS] × pay_per_spin
  Player RTP (buy mode):  E[pay | in FS] / cost_x
  Player RTP (natural mode is computed by `buy_feature_ev`)

Variance via Wald-II (mirrors fs_retrigger_compound).
"""
from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass
class FsBuyCompoundParams:
    cost_x: float            # buy cost as × total_bet
    initial_spins: int       # K_0 spins on buy
    retrigger_prob: float    # p_re Bernoulli per FS spin
    retrigger_spins: int     # ΔK added per retrigger
    max_total_spins: int     # session cap
    pay_per_spin: float      # E[pay × bet] per FS spin


def expected_session_spins(p: FsBuyCompoundParams) -> float:
    if p.retrigger_prob <= 0 or p.retrigger_spins <= 0:
        return float(p.initial_spins)
    m = p.retrigger_prob * p.retrigger_spins
    if m >= 1.0:
        return float(p.max_total_spins)
    return min(p.initial_spins / (1.0 - m), float(p.max_total_spins))


def buy_mode_rtp(p: FsBuyCompoundParams) -> float:
    """RTP from the player's perspective on a buy spin."""
    if p.cost_x <= 0:
        return 0.0
    return expected_session_spins(p) * p.pay_per_spin / p.cost_x


def variance_session_pay(p: FsBuyCompoundParams) -> float:
    if p.retrigger_prob <= 0 or p.retrigger_spins <= 0:
        return 0.0
    pr = p.retrigger_prob
    dk = p.retrigger_spins
    m = pr * dk
    if m >= 1.0:
        return float(p.max_total_spins) ** 2 * p.pay_per_spin ** 2
    e_t = expected_session_spins(p)
    var_t = (dk * dk) * e_t * pr * (1.0 - pr) / max(1.0 - m * m, 1e-12)
    return var_t * (p.pay_per_spin ** 2)


def mc_simulate(p: FsBuyCompoundParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_pay = 0.0
    spin_total = 0
    for _ in range(sessions):
        remaining = p.initial_spins
        played = 0
        while remaining > 0 and played < p.max_total_spins:
            remaining -= 1
            played += 1
            total_pay += p.pay_per_spin
            if rng.random() < p.retrigger_prob:
                room = p.max_total_spins - played - remaining
                if room > 0:
                    remaining += min(p.retrigger_spins, room)
        spin_total += played
    cost = p.cost_x * sessions
    return {
        "rtp_mc": total_pay / max(cost, 1e-12) if cost > 0 else 0.0,
        "mean_session_spins": spin_total / max(sessions, 1),
    }

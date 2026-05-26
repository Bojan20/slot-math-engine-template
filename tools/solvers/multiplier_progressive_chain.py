"""Closed-form kernel — Progressive Multiplier Chain.

Industry pattern (NetEnt Mega Moolah multiplier ladder, Pragmatic
Sweet Bonanza tumble multiplier): each cascade win bumps a global
multiplier by a fixed step Δ; multiplier resets on miss. Total pay
per session = Σ_t (m_0 + t·Δ) × base_pay, gated by Bernoulli win.

Closed-form
===========

  P(N=n | started) = p^(n-1)(1-p) for n < cap (truncated geometric)
  E[total mult | n wins] = Σ_(k=0..n-1)(m_0 + k·Δ)
                          = n·m_0 + Δ·n·(n-1)/2

  E[RTP | start] = e_pay × Σ_(n=1..cap) p^(n-1)(1-p) × (n·m_0 + Δ·n(n-1)/2)
  RTP = p_win × E[RTP | start]
"""
from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass
class ProgressiveMultiplierParams:
    p_win: float           # per-cascade Bernoulli win
    e_pay: float           # base pay per winning cascade
    m_initial: float       # m_0 starting multiplier (typ. 1)
    m_step: float          # Δ multiplier increment per win
    max_chain: int         # cap on consecutive wins


def expected_session_payout(p: ProgressiveMultiplierParams) -> float:
    if p.p_win <= 0 or p.e_pay <= 0:
        return 0.0
    total = 0.0
    for n in range(1, p.max_chain + 1):
        if n == p.max_chain:
            pn = p.p_win ** (n - 1)
        else:
            pn = (p.p_win ** (n - 1)) * (1.0 - p.p_win)
        mult_sum = n * p.m_initial + p.m_step * n * (n - 1) / 2.0
        total += pn * mult_sum * p.e_pay
    return total


def analytical_rtp(p: ProgressiveMultiplierParams) -> float:
    """RTP = p_win × E[session payout]."""
    return p.p_win * expected_session_payout(p)


def mc_simulate(p: ProgressiveMultiplierParams, spins: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_pay = 0.0
    for _ in range(spins):
        if rng.random() >= p.p_win:
            continue
        m = p.m_initial
        n = 0
        spin_pay = 0.0
        while n < p.max_chain:
            spin_pay += p.e_pay * m
            n += 1
            if n >= p.max_chain or rng.random() >= p.p_win:
                break
            m += p.m_step
        total_pay += spin_pay
    return {"rtp_mc": total_pay / max(spins, 1)}

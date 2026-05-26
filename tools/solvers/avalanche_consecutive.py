"""Closed-form kernel — Avalanche Consecutive-Win Bonus.

Industry pattern (Pragmatic Sweet Bonanza w/ multiplier collection,
Hacksaw Wanted Dead consecutive bonus, Microgaming "rolling reels"
games): each successive cascade win in the same spin bumps a bonus
multiplier (1× → 2× → 4× → 8× …) or awards an inline pay bonus.

Closed-form derivation
======================

Let:
  p_win        = per-cascade win probability (Bernoulli)
  e_pay        = expected base pay × bet per winning cascade
  mult_ladder  = {n: m_n} multiplier for the n-th consecutive win
                 (e.g. {1: 1, 2: 2, 3: 4, 4: 8, 5: 16})
  max_chain    = cap on chain length

The chain length N follows a truncated geometric distribution (same
as cascade_reaction_chain), conditional on the spin starting (prob
p_win):

  P(N = n | started) = p_win^(n-1) × (1 − p_win)   for n < max_chain
  P(N = max_chain | started) = p_win^(max_chain − 1)

Expected total pay GIVEN chain started:
  E[pay | start] = e_pay × Σ_(n=1..max_chain) P(N≥n) × m_n
                 = e_pay × Σ_(n=1..max_chain) p_win^(n-1) × m_n

Unconditional RTP:
  RTP = p_win × E[pay | start]

Note: mult_ladder[1] is typically 1 (first win has no bonus); the
KERNEL handles any ladder including non-monotonic and capped.

Acceptance band
===============
±3 % at 50K spins (chain length variance increases with ladder
height; high-multiplier games have ±5 % bias at this sample size).
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class AvalancheConsecutiveParams:
    """Parameters for the avalanche-consecutive-bonus closed-form solver.

    p_win:        per-cascade win Bernoulli probability
    e_pay:        expected pay × bet per winning cascade
    mult_ladder:  {n: m_n} multiplier for the n-th consecutive win
                  (n=1 is the first win); chain stops on first loss
    max_chain:    hard cap on chain length
    """

    p_win: float
    e_pay: float
    mult_ladder: Mapping[int, float]
    max_chain: int = 100


def expected_chain_payout(p: AvalancheConsecutiveParams) -> float:
    """E[pay | chain started] = e_pay × Σ p_win^(n-1) × m_n.

    Iterates n from 1 to max_chain. If the ladder is shorter than
    max_chain, the last published multiplier is reused (cap behavior).
    """
    if p.p_win <= 0:
        return 0.0
    last_pub = max(p.mult_ladder) if p.mult_ladder else 1
    out = 0.0
    for n in range(1, p.max_chain + 1):
        m_n = p.mult_ladder.get(n)
        if m_n is None:
            m_n = p.mult_ladder.get(last_pub, 1.0)
        out += (p.p_win ** (n - 1)) * m_n
    return p.e_pay * out


def analytical_rtp(p: AvalancheConsecutiveParams) -> float:
    """RTP = p_win × E[pay | start]."""
    return p.p_win * expected_chain_payout(p)


def mc_simulate(
    p: AvalancheConsecutiveParams,
    spins: int = 50_000,
    seed: int = 42,
) -> dict:
    """MC — start chain w/ prob p_win; on each subsequent cascade win,
    apply multiplier for the chain position; chain stops on first loss."""
    rng = random.Random(seed)
    total_pay = 0.0
    chain_lens = []
    last_pub = max(p.mult_ladder) if p.mult_ladder else 1
    for _ in range(spins):
        if rng.random() >= p.p_win:
            chain_lens.append(0)
            continue
        n = 1
        spin_pay = 0.0
        while n <= p.max_chain:
            m_n = p.mult_ladder.get(n)
            if m_n is None:
                m_n = p.mult_ladder.get(last_pub, 1.0)
            spin_pay += p.e_pay * m_n
            if rng.random() >= p.p_win:
                break
            n += 1
        chain_lens.append(n)
        total_pay += spin_pay
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "mean_chain": sum(chain_lens) / max(spins, 1),
    }

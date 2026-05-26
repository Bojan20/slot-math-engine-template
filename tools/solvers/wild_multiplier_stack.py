"""Closed-form kernel — Wild Multiplier Stack (Π of multipliers).

Industry pattern (Pragmatic Sweet Bonanza multiplier coin, NetEnt Gonzo
multiplier wild, Hacksaw Wanted Dead style): wilds carry random
multipliers drawn from a distribution; when ≥ 2 multiplier wilds land
on a winning line their multipliers MULTIPLY (not sum) — final pay =
base_pay × Π_i m_i.

Closed-form derivation
======================

Let:
  n_reels      = number of reels
  p_mw         = per-reel probability of landing a multiplier wild
  m_dist       = {m: P(M=m)} multiplier value distribution
  base_pay_ev  = expected base pay × bet on a winning line (without
                 multiplier wilds)

Per-line, the number of multiplier wilds K ~ Binomial(n_reels, p_mw).
The line pay multiplier random variable is:

  T = Π_(i=1..K) M_i        (independent draws from m_dist; T = 1 if K=0)

By independence:
  E[T | K] = (E[M])^K
  E[T]    = Σ_(k=0..n_reels) C(n,k) p^k (1−p)^(n−k) × (E[M])^k
          = (1 − p_mw + p_mw × E[M])^n_reels      (Binomial MGF)

Total RTP contribution from this feature on a single line:
  E[line_pay] = base_pay_ev × E[T]

If base_pay is computed assuming no wilds, the WAY this multiplier
sits ON TOP requires base_pay_ev to be the expected pay GIVEN that the
line has hit (i.e. multiplier acts as a factor, not a re-roll).

Acceptance band
===============
EXACT in expectation when wilds are independent of base symbols and
multiplier draws are iid.  MC ratio ∈ [0.98, 1.02] @ 30K spins.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class WildMultiplierStackParams:
    """Parameters for the wild-multiplier-stack closed-form solver.

    n_reels:        number of reels (line length)
    p_mult_wild:    per-reel probability of landing a multiplier wild
                    on the active row
    m_dist:         {m: P(M=m)} multiplier value distribution
    base_pay_ev:    expected base pay × bet given the line is a winner
                    (this kernel adds the multiplier *on top* — so
                    base_pay_ev is the engine-derived win without wild
                    factors)
    p_win:          probability the line is a winner at all
                    (factor for the unconditional RTP)
    """

    n_reels: int
    p_mult_wild: float
    m_dist: Mapping[float, float]
    base_pay_ev: float
    p_win: float = 1.0


def expected_multiplier(p: WildMultiplierStackParams) -> float:
    """E[M] = Σ m × P(M=m)."""
    return sum(m * pr for m, pr in p.m_dist.items())


def expected_pi_T(p: WildMultiplierStackParams) -> float:
    """E[Π_i M_i] = (1 − p + p · E[M])^n_reels by Binomial MGF."""
    e_m = expected_multiplier(p)
    return (1.0 - p.p_mult_wild + p.p_mult_wild * e_m) ** p.n_reels


def analytical_rtp(p: WildMultiplierStackParams) -> float:
    """Expected pay × bet contribution from this feature.

    Unconditional: p_win × base_pay_ev × E[Π M].
    """
    return p.p_win * p.base_pay_ev * expected_pi_T(p)


def mc_simulate(
    p: WildMultiplierStackParams,
    spins: int = 30_000,
    seed: int = 42,
) -> dict:
    """MC — draw n_reels Bernoulli wild indicators; for each wild draw
    a multiplier from m_dist; compute T = Π M_i; output pay = win ?
    base_pay × T : 0.
    """
    rng = random.Random(seed)
    m_items = list(p.m_dist.items())
    m_cum = []
    cum = 0.0
    for m, pr in m_items:
        cum += pr
        m_cum.append((m, cum))
    total = m_cum[-1][1] if m_cum else 1.0

    def _draw_m() -> float:
        x = rng.random() * total
        for m, c in m_cum:
            if x <= c:
                return m
        return m_cum[-1][0] if m_cum else 1.0

    total_pay = 0.0
    hits = 0
    for _ in range(spins):
        if rng.random() >= p.p_win:
            continue
        prod = 1.0
        for _r in range(p.n_reels):
            if rng.random() < p.p_mult_wild:
                prod *= _draw_m()
        total_pay += p.base_pay_ev * prod
        hits += 1
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "hit_freq": hits / max(spins, 1),
    }

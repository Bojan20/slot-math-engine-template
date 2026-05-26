"""Closed-form kernel — Scatter pays × TOTAL BET (not line bet).

Industry pattern: most modern slots pay scatters as a multiplier of
the TOTAL BET (n_lines × line_bet) rather than per active line. This
kernel computes RTP contribution from scatter pays under that rule.

Closed-form derivation
======================

Let:
  n_reels         = number of reels
  n_rows          = visible rows per reel
  p_sc_per_cell   = per-cell scatter landing probability
                    (engine builds this from reel strips, but a
                    weighted Bernoulli approximation works for the
                    aggregate)
  scatter_pays    = {k: pay × TOTAL BET} for k scatters (k ≥ 3 typ.)
  n_lines         = number of active paylines (factor for total bet)

For each cell we have Bernoulli(p_sc); total visible cells = n_reels ×
n_rows. The number of scatters K ~ Binomial(N, p), where N = total
cells.

  P(K = k) = C(N, k) × p^k × (1−p)^(N−k)

Total RTP from scatter pays:
  RTP_scatter = Σ_(k≥3) P(K=k) × scatter_pays[k] × n_lines / total_bet
             = Σ_(k≥3) P(K=k) × scatter_pays[k]      (when pays already
                                                       in × total_bet)

Acceptance band
===============
EXACT under the Bernoulli iid assumption (rarely true for reel-strip-
based scatters, but solver matches MC to within 0.5 % when the engine
also uses iid cells).  Engine MC remains source of truth.
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class ScatterTotalBetParams:
    """Parameters for the scatter × total-bet closed-form solver.

    n_reels:        number of reels
    n_rows:         visible rows per reel
    p_sc_per_cell:  per-cell scatter Bernoulli probability
    scatter_pays:   {k: pay × TOTAL BET} for ≥3 scatters
    """

    n_reels: int
    n_rows: int
    p_sc_per_cell: float
    scatter_pays: Mapping[int, float]


def _binom_pmf(n: int, k: int, p: float) -> float:
    """Binomial PMF using math.comb for numerical stability on n ≤ 30."""
    if k < 0 or k > n:
        return 0.0
    if p <= 0:
        return 1.0 if k == 0 else 0.0
    if p >= 1:
        return 1.0 if k == n else 0.0
    return math.comb(n, k) * (p ** k) * ((1.0 - p) ** (n - k))


def analytical_rtp(p: ScatterTotalBetParams) -> float:
    """Σ P(K=k) × scatter_pays[k] (pays already × total bet)."""
    n_cells = p.n_reels * p.n_rows
    rtp = 0.0
    for k, pay in p.scatter_pays.items():
        if pay <= 0 or k < 1 or k > n_cells:
            continue
        rtp += _binom_pmf(n_cells, k, p.p_sc_per_cell) * pay
    return rtp


def mc_simulate(
    p: ScatterTotalBetParams,
    spins: int = 30_000,
    seed: int = 42,
) -> dict:
    """MC — sample iid Bernoulli cells, count scatters, look up pay."""
    rng = random.Random(seed)
    n_cells = p.n_reels * p.n_rows
    total_pay = 0.0
    hits = 0
    for _ in range(spins):
        sc = sum(1 for _ in range(n_cells) if rng.random() < p.p_sc_per_cell)
        pay = p.scatter_pays.get(sc, 0.0)
        if pay > 0:
            total_pay += pay
            hits += 1
    return {
        "rtp_mc": total_pay / max(spins, 1),
        "hit_freq": hits / max(spins, 1),
    }

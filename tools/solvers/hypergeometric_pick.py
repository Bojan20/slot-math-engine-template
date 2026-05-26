"""Closed-form kernel — Hypergeometric Pick.

Industry pattern (true scratch-card without replacement, "Pick 3 of
N hidden cells, win if you pick all winners"): an urn contains K
winning cells out of N total; the player picks m cells WITHOUT
replacement. Win = picked all K (or `min_match` of them).

Hypergeometric PMF:
  P(X = k) = C(K, k) · C(N-K, m-k) / C(N, m)
  P(X >= min_match) = Σ_{k=min..min(K, m)} pmf(k)
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class HypergeometricPickParams:
    n_cells: int           # urn size N
    k_winners: int         # winners K
    m_picks: int           # picks m
    min_match: int         # winners-to-match for payout
    pay_when_match: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _hyper_pmf(N: int, K: int, m: int, k: int) -> float:
    if k < 0 or k > min(K, m):
        return 0.0
    if m - k > N - K:
        return 0.0
    return (math.comb(K, k) * math.comb(N - K, m - k)) / math.comb(N, m)


def prob_match(p: HypergeometricPickParams) -> float:
    if p.n_cells <= 0 or p.k_winners <= 0 or p.m_picks <= 0:
        raise ValueError("n_cells, k_winners, m_picks must be > 0")
    if p.k_winners > p.n_cells or p.m_picks > p.n_cells:
        raise ValueError("counts out of range")
    upper = min(p.k_winners, p.m_picks)
    total = 0.0
    for k in range(p.min_match, upper + 1):
        total += _hyper_pmf(p.n_cells, p.k_winners, p.m_picks, k)
    return total


def analytical_rtp(p: HypergeometricPickParams) -> float:
    return prob_match(p) * p.pay_when_match


def mc_simulate(p: HypergeometricPickParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    hits = 0
    cells = [1] * p.k_winners + [0] * (p.n_cells - p.k_winners)
    for _ in range(spins):
        picks = rng.sample(cells, p.m_picks)
        k_hit = sum(picks)
        if k_hit >= p.min_match:
            hits += 1
            total += p.pay_when_match
    return {
        "rtp_mc": total / max(spins, 1),
        "match_rate": hits / max(spins, 1),
    }

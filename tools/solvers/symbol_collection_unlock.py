"""Closed-form kernel — Symbol Collection Unlock.

Industry pattern (Push Gaming Mount Magmas collect-meter, Pragmatic
Power of Olympus token meter): collect M distinct symbols over a
session of `n_spins` to unlock a `unlock_pay`. Per spin, the chance
of collecting a fresh symbol decreases as the player accumulates.

Closed-form (Coupon Collector style):
  E[spins to collect M] = M · H_M  (harmonic number)
  P(collect M within n_spins) ≈ Σ inclusion-exclusion

Simplified bound (lower):
  P_lower = 1 - M · (1 - (1/M))^n_spins  (union bound on missing
            symbols)

Use Stirling-style numerics; kernel exposes:
  prob_unlock = 1 - P(some symbol uncollected)
              = Σ_{i=0..M} (-1)^i C(M,i) (1 - i/M)^n
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class SymbolCollectionUnlockParams:
    p_trigger: float
    n_symbols: int          # collection target M
    n_spins: int            # spins available
    unlock_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def prob_unlock(M: int, n: int) -> float:
    if M <= 0:
        return 1.0
    if n <= 0:
        return 0.0
    total = 0.0
    for i in range(0, M + 1):
        sign = -1.0 if (i % 2 == 1) else 1.0
        term = sign * math.comb(M, i) * ((1.0 - i / M) ** n)
        total += term
    # The Stirling number formula gives M! · S(n, M) / M^n which equals total
    # for collecting "all M coupons in exactly n distinct draws"; we want
    # P(>= M distinct in n draws) = total above.
    return max(0.0, min(1.0, total))


def analytical_rtp(p: SymbolCollectionUnlockParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.n_symbols <= 0:
        raise ValueError("n_symbols must be > 0")
    if p.n_spins < 0:
        raise ValueError("n_spins must be >= 0")
    return p.p_trigger * prob_unlock(p.n_symbols, p.n_spins) * p.unlock_pay


def mc_simulate(p: SymbolCollectionUnlockParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    unlocks = 0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        collected: set[int] = set()
        for _ in range(p.n_spins):
            collected.add(rng.randrange(p.n_symbols))
            if len(collected) == p.n_symbols:
                break
        if len(collected) == p.n_symbols:
            unlocks += 1
            total += p.unlock_pay
    return {
        "rtp_mc": total / max(spins, 1),
        "unlock_rate": unlocks / max(triggers, 1),
    }

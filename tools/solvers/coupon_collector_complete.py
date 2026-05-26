"""Closed-form kernel — Coupon Collector Complete Set.

Classic problem: collect a complete set of N distinct symbols
(coupons) where each spin reveals one uniformly at random. Drives
"collect all N to unlock" mechanics.

Closed-form
===========

Expected spins to collect all N coupons:
  E[T] = N · H_N    where H_N = Σ_{i=1..N} 1/i

Variance:
  Var[T] = N^2 · Σ_{i=1..N} 1/i^2 - N · H_N

Tail bound: P(T > c · N ln N) <= N^(-c + 1)
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class CouponCollectorParams:
    n_distinct: int             # N
    pay_on_complete: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def harmonic_number(n: int) -> float:
    return sum(1.0 / i for i in range(1, n + 1))


def expected_spins_to_complete(p: CouponCollectorParams) -> float:
    if p.n_distinct <= 0:
        raise ValueError("n_distinct must be > 0")
    return p.n_distinct * harmonic_number(p.n_distinct)


def variance_spins_to_complete(p: CouponCollectorParams) -> float:
    N = p.n_distinct
    sum_inv_sq = sum(1.0 / (i ** 2) for i in range(1, N + 1))
    return N ** 2 * sum_inv_sq - N * harmonic_number(N)


def analytical_rtp(p: CouponCollectorParams) -> float:
    """RTP per spin in the long run = pay / E[T]."""
    ts = expected_spins_to_complete(p)
    if ts <= 0:
        return 0.0
    return p.pay_on_complete / ts


def mc_simulate(p: CouponCollectorParams, sessions: int = 20_000,
                seed: int = 42, max_spins: int = 100_000) -> dict[str, float]:
    rng = random.Random(seed)
    total_pay = 0.0
    total_spins = 0
    completes = 0
    for _ in range(sessions):
        collected: set[int] = set()
        spins_taken = 0
        for _ in range(max_spins):
            spins_taken += 1
            collected.add(rng.randrange(p.n_distinct))
            if len(collected) == p.n_distinct:
                completes += 1
                total_pay += p.pay_on_complete
                break
        total_spins += spins_taken
    avg_spins = total_spins / max(sessions, 1)
    return {
        "rtp_mc": total_pay / max(total_spins, 1),
        "avg_spins_to_complete": avg_spins,
        "complete_rate": completes / max(sessions, 1),
    }

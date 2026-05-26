"""Closed-form kernel — Zipf-Rank Paytable Distribution.

Industry pattern (paytable where row pays follow Zipf law:
rank-r row pays ∝ 1/r^s — used in "rare high-pay" designs where
the top-pay row is exponentially rarer than mid-pay rows):

  P(row r) = (1/r^s) / H_{N, s}
  pay(row r) = pay_base · r^a

where H_{N, s} = Σ_{i=1..N} 1/i^s is the Nth harmonic-of-power.

Expected per-trigger pay:
  E[pay] = Σ_r P(r) · pay(r) = (Σ_r r^(a-s)) / H_{N, s} · pay_base
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class ZipfPaytableParams:
    n_rows: int
    s_exponent: float          # Zipf exponent on probability
    a_pay_exponent: float      # exponent on pay (higher rank = higher pay)
    pay_base: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _harmonic_power(n: int, s: float) -> float:
    if n <= 0:
        return 0.0
    return sum(1.0 / (i ** s) for i in range(1, n + 1))


def expected_pay(p: ZipfPaytableParams) -> float:
    if p.n_rows <= 0:
        raise ValueError("n_rows must be > 0")
    if p.s_exponent <= 0:
        raise ValueError("s_exponent must be > 0")
    H = _harmonic_power(p.n_rows, p.s_exponent)
    if H == 0:
        return 0.0
    num = sum((r ** p.a_pay_exponent) / (r ** p.s_exponent)
              for r in range(1, p.n_rows + 1))
    return p.pay_base * num / H


def analytical_rtp(p: ZipfPaytableParams) -> float:
    return expected_pay(p)


def mc_simulate(p: ZipfPaytableParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    H = _harmonic_power(p.n_rows, p.s_exponent)
    weights = [1.0 / (r ** p.s_exponent) for r in range(1, p.n_rows + 1)]
    cdf = []
    acc = 0.0
    for w in weights:
        acc += w
        cdf.append(acc / H)
    total = 0.0
    for _ in range(spins):
        r_idx = p.n_rows
        u = rng.random()
        for i, c in enumerate(cdf):
            if u < c:
                r_idx = i + 1
                break
        total += p.pay_base * (r_idx ** p.a_pay_exponent)
    return {
        "rtp_mc": total / max(spins, 1),
        "harmonic": H,
    }

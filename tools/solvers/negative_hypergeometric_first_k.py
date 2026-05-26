"""Closed-form kernel — Negative Hypergeometric First-K Draw.

Industry pattern (sample-without-replacement until K successes —
"draw until you find all winners"): an urn contains K winning
tokens out of N total. Draws are without replacement; the
distribution of the number of draws until exactly K successes is
the Negative Hypergeometric.

Closed-form
===========

Let X = number of draws until K-th success.
  E[X] = K · (N + 1) / (K + 1)
  Var[X] = K · (N - K) · (N + 1) / ((K + 1)^2 · (K + 2))

Per-session EV (uniform pay per draw made):
  uplift = E[X] · pay_per_draw
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class NegHyperFirstKParams:
    n_total: int
    k_winners: int
    pay_per_draw: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_draws(p: NegHyperFirstKParams) -> float:
    if p.n_total <= 0 or p.k_winners <= 0:
        raise ValueError("n_total and k_winners must be > 0")
    if p.k_winners > p.n_total:
        raise ValueError("k_winners > n_total")
    return p.k_winners * (p.n_total + 1) / (p.k_winners + 1)


def variance_draws(p: NegHyperFirstKParams) -> float:
    N, K = p.n_total, p.k_winners
    return K * (N - K) * (N + 1) / ((K + 1) ** 2 * (K + 2))


def analytical_rtp(p: NegHyperFirstKParams) -> float:
    return expected_draws(p) * p.pay_per_draw


def mc_simulate(p: NegHyperFirstKParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    draws_total = 0
    for _ in range(spins):
        urn = [1] * p.k_winners + [0] * (p.n_total - p.k_winners)
        rng.shuffle(urn)
        successes = 0
        draws = 0
        for token in urn:
            draws += 1
            if token == 1:
                successes += 1
                if successes >= p.k_winners:
                    break
        total += draws * p.pay_per_draw
        draws_total += draws
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_draws": draws_total / max(spins, 1),
    }

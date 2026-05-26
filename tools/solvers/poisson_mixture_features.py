"""Closed-form kernel — Poisson Mixture Feature Rate.

Industry pattern (multi-mode bonus where the trigger rate depends
on hidden game mode — e.g. base mode vs. "hot" mode): feature
trigger count per session ~ mixture:

  N | mode=base ~ Poisson(λ_base)
  N | mode=hot  ~ Poisson(λ_hot)
  P(mode=hot) = q

Marginal E[N] = q · λ_hot + (1-q) · λ_base
Per-feature pay = pay_per_feature
  uplift = (q · λ_hot + (1-q) · λ_base) · pay_per_feature
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class PoissonMixtureParams:
    q_hot: float
    lambda_base: float
    lambda_hot: float
    pay_per_feature: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_features(p: PoissonMixtureParams) -> float:
    if not (0.0 <= p.q_hot <= 1.0):
        raise ValueError("q_hot out of [0, 1]")
    if p.lambda_base < 0 or p.lambda_hot < 0:
        raise ValueError("lambdas must be >= 0")
    return p.q_hot * p.lambda_hot + (1.0 - p.q_hot) * p.lambda_base


def variance_features(p: PoissonMixtureParams) -> float:
    """Var of mixture = mixture of variances + variance of means."""
    e_n = expected_features(p)
    e_var = p.q_hot * p.lambda_hot + (1.0 - p.q_hot) * p.lambda_base
    var_of_means = (
        p.q_hot * (p.lambda_hot - e_n) ** 2
        + (1.0 - p.q_hot) * (p.lambda_base - e_n) ** 2
    )
    return e_var + var_of_means


def analytical_rtp(p: PoissonMixtureParams) -> float:
    return expected_features(p) * p.pay_per_feature


def mc_simulate(p: PoissonMixtureParams, sessions: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    n_features_total = 0
    for _ in range(sessions):
        lam = p.lambda_hot if rng.random() < p.q_hot else p.lambda_base
        # Sample Poisson via Knuth
        L = math.exp(-lam)
        k = 0
        prod = rng.random()
        while prod > L:
            k += 1
            prod *= rng.random()
        n_features_total += k
        total += k * p.pay_per_feature
    return {
        "rtp_mc": total / max(sessions, 1),
        "avg_features": n_features_total / max(sessions, 1),
    }

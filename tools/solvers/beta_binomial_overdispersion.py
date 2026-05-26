"""Closed-form kernel — Beta-Binomial Overdispersion.

Industry pattern (cluster-pay games where per-cell success
probability is itself random — overdispersion vs pure Binomial):

  • Cell success rate p ~ Beta(alpha, beta)
  • Conditional on p, k successes ~ Binomial(n, p)
  • Marginal: Beta-Binomial(n, alpha, beta)

Moments:
  E[k] = n · alpha / (alpha + beta)
  Var[k] = n · alpha · beta · (alpha + beta + n) / ((alpha + beta)^2 · (alpha + beta + 1))

The kernel exposes E[k] · pay_per_success as analytical RTP and the
overdispersion variance ratio vs pure Binomial.
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class BetaBinomialParams:
    n_trials: int
    alpha: float
    beta: float
    pay_per_success: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_successes(p: BetaBinomialParams) -> float:
    if p.alpha <= 0 or p.beta <= 0:
        raise ValueError("alpha and beta must be > 0")
    if p.n_trials < 0:
        raise ValueError("n_trials must be >= 0")
    return p.n_trials * p.alpha / (p.alpha + p.beta)


def variance_successes(p: BetaBinomialParams) -> float:
    a, b, n = p.alpha, p.beta, p.n_trials
    return n * a * b * (a + b + n) / ((a + b) ** 2 * (a + b + 1))


def overdispersion_ratio(p: BetaBinomialParams) -> float:
    a, b, n = p.alpha, p.beta, p.n_trials
    # Pure binomial variance under p = a/(a+b)
    p_mean = a / (a + b)
    binom_var = n * p_mean * (1.0 - p_mean)
    if binom_var <= 0:
        return float("inf")
    return variance_successes(p) / binom_var


def analytical_rtp(p: BetaBinomialParams) -> float:
    return expected_successes(p) * p.pay_per_success


def mc_simulate(p: BetaBinomialParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    successes = []
    for _ in range(spins):
        # Sample p ~ Beta(alpha, beta) via gamma deviates
        x = rng.gammavariate(p.alpha, 1.0)
        y = rng.gammavariate(p.beta, 1.0)
        p_sample = x / (x + y) if (x + y) > 0 else 0.0
        k = sum(1 for _ in range(p.n_trials) if rng.random() < p_sample)
        successes.append(k)
        total += k * p.pay_per_success
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_successes": sum(successes) / max(spins, 1),
    }

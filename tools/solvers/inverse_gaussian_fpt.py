"""Closed-form kernel — Inverse-Gaussian First-Passage Time.

The Inverse Gaussian distribution arises as the first-passage time
of a Wiener process with drift. Used to model a meter that
charges via Brownian-with-drift dynamics until it hits a barrier.

PDF and moments:
  f(x; μ, λ) = √(λ / (2π x^3)) · exp(-λ (x - μ)^2 / (2 μ^2 x))
  E[X] = μ
  Var[X] = μ^3 / λ
  P(X <= x) closed-form via standard normal CDF (omitted here).

Per-trigger uplift:
  uplift = pay_on_fill / E[X_filltime]
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class InverseGaussianFPTParams:
    mu_meantime: float
    lambda_shape: float
    pay_on_fill: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_fpt(p: InverseGaussianFPTParams) -> float:
    if p.mu_meantime <= 0:
        raise ValueError("mu_meantime must be > 0")
    return p.mu_meantime


def variance_fpt(p: InverseGaussianFPTParams) -> float:
    if p.lambda_shape <= 0:
        raise ValueError("lambda_shape must be > 0")
    return p.mu_meantime ** 3 / p.lambda_shape


def analytical_rtp(p: InverseGaussianFPTParams) -> float:
    """RTP per unit time = pay / E[time]."""
    return p.pay_on_fill / expected_fpt(p)


def mc_simulate(p: InverseGaussianFPTParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    """Sample Inverse-Gaussian via Michael-Schucany-Haas algorithm."""
    rng = random.Random(seed)
    total_pay = 0.0
    total_time = 0.0
    samples = []
    mu = p.mu_meantime
    lam = p.lambda_shape
    for _ in range(sessions):
        # Sample IG(mu, lambda):
        v = rng.gauss(0, 1) ** 2
        x = (
            mu + (mu ** 2 * v) / (2 * lam)
            - (mu / (2 * lam)) * math.sqrt(4 * mu * lam * v + mu ** 2 * v ** 2)
        )
        u = rng.random()
        if u <= mu / (mu + x):
            t = x
        else:
            t = mu ** 2 / x
        samples.append(t)
        total_pay += p.pay_on_fill
        total_time += t
    return {
        "rtp_mc": total_pay / max(total_time, 1e-9),
        "mean_fpt": sum(samples) / max(len(samples), 1),
    }

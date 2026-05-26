"""Closed-form kernel — Renewal Process Feature Inter-Arrivals.

Industry pattern (feature triggers spaced by random gaps; e.g.
mystery jackpot inter-arrival): inter-arrival time T_i ~ G with
mean E[T] = mu and variance Var(T) = sigma2. Long-run feature
trigger rate (renewal theorem):

  lim_{n→∞} N(n) / n = 1 / mu

Expected total payout per `horizon` spins:
  E[payout] = (horizon / mu) · pay_per_feature

Variance of trigger count (renewal CLT, large-horizon):
  Var[N(horizon)] ≈ horizon · sigma2 / mu^3
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class RenewalProcessParams:
    horizon: int                  # session length in spins
    inter_arrival_mean: float     # mu
    inter_arrival_var: float      # sigma^2
    pay_per_feature: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def long_run_rate(p: RenewalProcessParams) -> float:
    if p.inter_arrival_mean <= 0:
        raise ValueError("inter_arrival_mean must be > 0")
    return 1.0 / p.inter_arrival_mean


def expected_features(p: RenewalProcessParams) -> float:
    return p.horizon * long_run_rate(p)


def variance_features(p: RenewalProcessParams) -> float:
    if p.inter_arrival_mean <= 0:
        return 0.0
    return p.horizon * p.inter_arrival_var / (p.inter_arrival_mean ** 3)


def analytical_rtp(p: RenewalProcessParams) -> float:
    return expected_features(p) * p.pay_per_feature


def mc_simulate(p: RenewalProcessParams, sessions: int = 30_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    n_features_total = 0
    # Sample inter-arrivals via log-normal matched to mean/var
    mean = p.inter_arrival_mean
    sigma2 = math.log(1 + p.inter_arrival_var / max(mean ** 2, 1e-12))
    mu = math.log(max(mean, 1e-12)) - sigma2 / 2
    for _ in range(sessions):
        t = 0.0
        n_features = 0
        while True:
            dt = rng.lognormvariate(mu, math.sqrt(sigma2)) if sigma2 > 0 else mean
            t += dt
            if t > p.horizon:
                break
            n_features += 1
            total += p.pay_per_feature
        n_features_total += n_features
    return {
        "rtp_mc": total / max(sessions, 1),
        "avg_features": n_features_total / max(sessions, 1),
    }

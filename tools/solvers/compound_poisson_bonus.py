"""Closed-form kernel — Compound Poisson Bonus.

Industry pattern (lottery-style "Quick Hit" features): per session,
the number of bonus events follows Poisson(lambda); each event
contributes an iid pay with mean `mean_pay` and variance `var_pay`.

Compound Poisson moments (Wald's identity):
  E[total_pay] = lambda · mean_pay
  Var[total_pay] = lambda · (mean_pay^2 + var_pay)

Per-session RTP:
  uplift = lambda · mean_pay
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class CompoundPoissonParams:
    lambda_per_session: float
    mean_pay: float
    var_pay: float                # variance of per-event pay
    bet_per_session: float = 1.0


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_total_pay(p: CompoundPoissonParams) -> float:
    if p.lambda_per_session < 0:
        raise ValueError("lambda must be >= 0")
    return p.lambda_per_session * p.mean_pay


def variance_total_pay(p: CompoundPoissonParams) -> float:
    return p.lambda_per_session * (p.mean_pay ** 2 + p.var_pay)


def analytical_rtp(p: CompoundPoissonParams) -> float:
    if p.bet_per_session <= 0:
        raise ValueError("bet_per_session must be > 0")
    return expected_total_pay(p) / p.bet_per_session


def mc_simulate(p: CompoundPoissonParams, sessions: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    n_events_total = 0
    # Use log-normal approximation matched to mean + var of pay
    sigma2 = math.log(1 + p.var_pay / max(p.mean_pay ** 2, 1e-12)) if p.mean_pay > 0 else 0.0
    mu = math.log(max(p.mean_pay, 1e-12)) - sigma2 / 2 if p.mean_pay > 0 else 0.0
    for _ in range(sessions):
        # Sample N ~ Poisson(lambda) via Knuth's algorithm
        L = math.exp(-p.lambda_per_session)
        k = 0
        prod = rng.random()
        while prod > L:
            k += 1
            prod *= rng.random()
        n_events_total += k
        for _ in range(k):
            if p.var_pay <= 0:
                total += p.mean_pay
            else:
                total += rng.lognormvariate(mu, math.sqrt(sigma2))
    return {
        "rtp_mc": total / max(sessions * p.bet_per_session, 1e-9),
        "avg_events_per_session": n_events_total / max(sessions, 1),
    }

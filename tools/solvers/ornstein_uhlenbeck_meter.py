"""Closed-form kernel — Ornstein-Uhlenbeck Mean-Reverting Meter.

Industry pattern (operator wants a meter that drifts but reverts
toward a fixed mean — e.g. "house RTP stays near 95% even under
local hot streaks"): continuous-time OU process

  dX_t = θ (μ - X_t) dt + σ dW_t

Stationary distribution: Normal(μ, σ² / (2θ)).

Expected meter level at time t (starting at x_0):
  E[X_t | x_0] = μ + (x_0 - μ) · e^(-θ t)
  Var[X_t | x_0] = σ² · (1 - e^(-2θ t)) / (2θ)

The kernel computes expected level at horizon T and converts to
pay via pay_per_unit · level.
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class OrnsteinUhlenbeckParams:
    theta: float                 # mean-reversion rate
    mu_target: float             # long-run mean
    sigma: float                 # noise scale
    x0: float                    # starting level
    horizon_T: float
    pay_per_unit: float = 1.0


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_level(p: OrnsteinUhlenbeckParams) -> float:
    if p.theta < 0:
        raise ValueError("theta must be >= 0")
    if p.horizon_T < 0:
        raise ValueError("horizon_T must be >= 0")
    return p.mu_target + (p.x0 - p.mu_target) * math.exp(-p.theta * p.horizon_T)


def variance_level(p: OrnsteinUhlenbeckParams) -> float:
    if p.sigma < 0 or p.theta <= 0:
        return 0.0
    return p.sigma ** 2 * (1 - math.exp(-2 * p.theta * p.horizon_T)) / (2 * p.theta)


def stationary_mean(p: OrnsteinUhlenbeckParams) -> float:
    return p.mu_target


def stationary_variance(p: OrnsteinUhlenbeckParams) -> float:
    if p.theta <= 0:
        return float("inf")
    return p.sigma ** 2 / (2 * p.theta)


def analytical_rtp(p: OrnsteinUhlenbeckParams) -> float:
    return expected_level(p) * p.pay_per_unit


def mc_simulate(p: OrnsteinUhlenbeckParams, sessions: int = 30_000,
                seed: int = 42, n_steps: int = 100) -> dict[str, float]:
    rng = random.Random(seed)
    dt = p.horizon_T / max(n_steps, 1)
    sigma_step = p.sigma * math.sqrt(dt)
    total_pay = 0.0
    end_levels: list[float] = []
    for _ in range(sessions):
        x = p.x0
        for _ in range(n_steps):
            x += p.theta * (p.mu_target - x) * dt + rng.gauss(0, sigma_step)
        end_levels.append(x)
        total_pay += x * p.pay_per_unit
    return {
        "rtp_mc": total_pay / max(sessions, 1),
        "mean_end": sum(end_levels) / max(sessions, 1),
    }

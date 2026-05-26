"""Closed-form kernel — Brownian Bankroll with Absorbing Boundaries.

Industry pattern (player session modeled as Brownian motion with
drift; absorbing barriers at bankruptcy and cash-out target):

  dB_t = μ_drift dt + σ dW_t

Boundaries: 0 (bust) and `target_balance`. Starting at `B_0`.

Closed-form (gambler's ruin in continuous time):
  P(reach target before bust) =
    if μ ≠ 0:  (1 - e^(-2μ B_0 / σ²)) / (1 - e^(-2μ target / σ²))
    if μ = 0:  B_0 / target

Expected time to absorption:
  if μ ≠ 0:  (B_0 - target · P(reach target)) / μ
  if μ = 0:  B_0 · (target - B_0) / σ²
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class BrownianBankrollParams:
    starting_balance: float
    target_balance: float
    mu_drift: float            # per-unit-time drift (negative for casino edge)
    sigma: float               # diffusion
    pay_on_target: float       # payout if player reaches target


ACCEPTANCE_TOLERANCE_MC = 0.05


def prob_reach_target(p: BrownianBankrollParams) -> float:
    if p.sigma <= 0:
        raise ValueError("sigma must be > 0")
    if p.target_balance <= 0:
        raise ValueError("target_balance must be > 0")
    if not (0 <= p.starting_balance <= p.target_balance):
        raise ValueError("starting_balance must be in [0, target_balance]")
    if abs(p.mu_drift) < 1e-12:
        return p.starting_balance / p.target_balance
    num = 1.0 - math.exp(-2 * p.mu_drift * p.starting_balance / p.sigma ** 2)
    den = 1.0 - math.exp(-2 * p.mu_drift * p.target_balance / p.sigma ** 2)
    if abs(den) < 1e-15:
        return p.starting_balance / p.target_balance
    return num / den


def expected_time_to_absorption(p: BrownianBankrollParams) -> float:
    if p.sigma <= 0:
        return float("inf")
    if abs(p.mu_drift) < 1e-12:
        return p.starting_balance * (p.target_balance - p.starting_balance) / p.sigma ** 2
    pr = prob_reach_target(p)
    return (p.starting_balance - p.target_balance * pr) / p.mu_drift


def analytical_rtp(p: BrownianBankrollParams) -> float:
    return prob_reach_target(p) * p.pay_on_target


def mc_simulate(p: BrownianBankrollParams, sessions: int = 20_000,
                seed: int = 42, max_steps: int = 10_000,
                dt: float = 1.0) -> dict[str, float]:
    rng = random.Random(seed)
    sigma_step = p.sigma * math.sqrt(dt)
    target_hits = 0
    busts = 0
    times: list[int] = []
    total = 0.0
    for _ in range(sessions):
        b = p.starting_balance
        for step in range(1, max_steps + 1):
            b += p.mu_drift * dt + rng.gauss(0.0, sigma_step)
            if b <= 0:
                busts += 1
                times.append(step)
                break
            if b >= p.target_balance:
                target_hits += 1
                total += p.pay_on_target
                times.append(step)
                break
    return {
        "rtp_mc": total / max(sessions, 1),
        "target_hit_rate": target_hits / max(sessions, 1),
        "bust_rate": busts / max(sessions, 1),
        "avg_time": sum(times) / max(len(times), 1) if times else 0.0,
    }

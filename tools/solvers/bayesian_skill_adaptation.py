"""Closed-form kernel — Bayesian Skill Adaptation (Class-III-style).

Industry pattern (skill-influenced bonus games where the operator
adapts difficulty based on observed player accuracy): the game
tracks a Beta-distributed belief over the player's true skill
`theta` (a Bernoulli success rate). After observing wins/losses,
the posterior updates via conjugate Beta update.

Closed-form
===========

Beta(α, β) prior → after `n_obs` observations with `k` wins:
  Posterior = Beta(α + k, β + n_obs - k)
  Posterior mean = (α + k) / (α + β + n_obs)

Calibration target: keep posterior mean ≈ `target_rate` so the
bonus pays at a stable expected RTP.

Expected payout per trigger (Bayes-mean × bonus_pay):
  uplift = posterior_mean · bonus_pay
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class BayesianSkillAdaptParams:
    prior_alpha: float
    prior_beta: float
    n_obs: int
    k_wins: int
    bonus_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def posterior_alpha_beta(p: BayesianSkillAdaptParams) -> tuple[float, float]:
    if p.prior_alpha <= 0 or p.prior_beta <= 0:
        raise ValueError("prior_alpha and prior_beta must be > 0")
    if p.n_obs < 0:
        raise ValueError("n_obs must be >= 0")
    if not (0 <= p.k_wins <= p.n_obs):
        raise ValueError("k_wins must be in [0, n_obs]")
    return (p.prior_alpha + p.k_wins,
            p.prior_beta + (p.n_obs - p.k_wins))


def posterior_mean(p: BayesianSkillAdaptParams) -> float:
    a, b = posterior_alpha_beta(p)
    return a / (a + b)


def analytical_rtp(p: BayesianSkillAdaptParams) -> float:
    return posterior_mean(p) * p.bonus_pay


def mc_simulate(p: BayesianSkillAdaptParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    mean = posterior_mean(p)
    total = 0.0
    wins = 0
    for _ in range(spins):
        if rng.random() < mean:
            total += p.bonus_pay
            wins += 1
    return {
        "rtp_mc": total / max(spins, 1),
        "win_rate": wins / max(spins, 1),
    }

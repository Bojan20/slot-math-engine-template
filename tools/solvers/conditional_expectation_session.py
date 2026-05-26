"""Closed-form kernel — Conditional Session Expectation.

Industry pattern (mid-session expected close-out value):
given a player has already accumulated `balance_so_far` after
`spins_so_far` of an `n_total` spin session, what is the expected
end-balance under a fair process with per-spin mean `mu` and var
`sigma2`?

Closed-form (Wald's identity + CLT):
  E[end_balance] = balance_so_far + (n_total - spins_so_far) · mu
  Var[end_balance] = (n_total - spins_so_far) · sigma2

The kernel returns E[end_balance], a 95% CI half-width, and a
"likely_positive" flag (P(end_balance >= 0) > 0.5).
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class ConditionalSessionParams:
    n_total: int
    spins_so_far: int
    balance_so_far: float       # net win/loss so far (pay - bet)
    mu_per_spin: float          # mean (pay - bet) per spin (≤ 0 for casino-favoured)
    sigma2_per_spin: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def remaining_spins(p: ConditionalSessionParams) -> int:
    if p.n_total < 0:
        raise ValueError("n_total must be >= 0")
    if p.spins_so_far < 0 or p.spins_so_far > p.n_total:
        raise ValueError("spins_so_far must be in [0, n_total]")
    return p.n_total - p.spins_so_far


def conditional_expectation(p: ConditionalSessionParams) -> float:
    return p.balance_so_far + remaining_spins(p) * p.mu_per_spin


def conditional_variance(p: ConditionalSessionParams) -> float:
    return remaining_spins(p) * max(0.0, p.sigma2_per_spin)


def ci95_halfwidth(p: ConditionalSessionParams) -> float:
    return 1.96 * math.sqrt(conditional_variance(p))


def likely_positive(p: ConditionalSessionParams) -> bool:
    return conditional_expectation(p) > 0.0


def analytical_rtp(p: ConditionalSessionParams) -> float:
    """Expected end-balance / total wagered (assuming unit bets)."""
    if p.n_total == 0:
        return 0.0
    return conditional_expectation(p) / p.n_total


def mc_simulate(p: ConditionalSessionParams, sessions: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    end_balances = []
    sigma = math.sqrt(max(p.sigma2_per_spin, 0.0))
    rem = remaining_spins(p)
    for _ in range(sessions):
        bal = p.balance_so_far
        for _ in range(rem):
            bal += rng.gauss(p.mu_per_spin, sigma)
        end_balances.append(bal)
    if not end_balances:
        return {"rtp_mc": 0.0, "mean_end": 0.0, "var_end": 0.0}
    mean = sum(end_balances) / len(end_balances)
    var = sum((x - mean) ** 2 for x in end_balances) / max(len(end_balances) - 1, 1)
    return {
        "rtp_mc": mean / max(p.n_total, 1),
        "mean_end": mean,
        "var_end": var,
    }

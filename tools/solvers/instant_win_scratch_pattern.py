"""Closed-form kernel — Instant-Win Scratch Pattern.

Industry pattern (state lottery scratch-style instant tickets,
Yggdrasil "Hit it Big" instant reveal): N hidden cells revealed at
once; a win is declared when `min_matches` cells reveal the SAME
target symbol (chosen at ticket-print time). Per-cell symbol prob
`p_target`.

Closed-form:
  P(win) = P(Binomial(n_cells, p_target) >= min_matches)
  pay = pay_when_win  (fixed)
  uplift = P(win) · pay
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class InstantWinScratchParams:
    n_cells: int
    p_target: float
    min_matches: int
    pay_when_win: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def _binomial_tail_ge(n: int, k: int, p: float) -> float:
    if k <= 0:
        return 1.0
    if k > n:
        return 0.0
    total = 0.0
    for j in range(k, n + 1):
        total += math.comb(n, j) * (p ** j) * ((1 - p) ** (n - j))
    return total


def prob_win(p: InstantWinScratchParams) -> float:
    if not (0.0 <= p.p_target <= 1.0):
        raise ValueError("p_target out of [0, 1]")
    return _binomial_tail_ge(p.n_cells, p.min_matches, p.p_target)


def analytical_rtp(p: InstantWinScratchParams) -> float:
    return prob_win(p) * p.pay_when_win


def mc_simulate(p: InstantWinScratchParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    wins = 0
    for _ in range(spins):
        k = sum(1 for _ in range(p.n_cells) if rng.random() < p.p_target)
        if k >= p.min_matches:
            wins += 1
            total += p.pay_when_win
    return {
        "rtp_mc": total / max(spins, 1),
        "win_rate": wins / max(spins, 1),
    }

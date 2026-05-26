"""Closed-form kernel — Martingale Doubling Strategy.

Player-strategy kernel (not a slot feature per se): after each
losing spin the player doubles their next bet, hoping a single win
recoups all losses + a unit profit. The strategy is bounded by:

  • bankroll B (player cannot afford the next double)
  • max_steps n (operator-imposed table limit on bet ladder)

Outcome distribution
====================

Probability of winning before bust (geometric truncated):
  P(win) = 1 - (1 - p_win)^max_steps     if bankroll allows full ladder
         = 1 - (1 - p_win)^m              where m = min(max_steps, bankroll cap)

Expected net per session (in unit bets):
  E[net] = (1) · P(win) + (-2^m + 1) · (1 - P(win))

True long-run RTP for this strategy on a fair slot with RTP rho
remains rho — the strategy can't beat the house — but the kernel
exposes the *variance + ruin profile* designers need when running
"big bet ladder" sales demos.
"""
from __future__ import annotations
import math
import random
from dataclasses import dataclass


@dataclass
class MartingaleParams:
    p_win: float
    max_steps: int             # operator bet-ladder cap
    starting_unit: float = 1.0


ACCEPTANCE_TOLERANCE_MC = 0.05


def _ladder_steps(max_steps: int) -> int:
    if max_steps < 1:
        raise ValueError("max_steps must be >= 1")
    return max_steps


def prob_session_win(p: MartingaleParams) -> float:
    if not (0.0 < p.p_win <= 1.0):
        raise ValueError("p_win out of (0, 1]")
    return 1.0 - (1.0 - p.p_win) ** _ladder_steps(p.max_steps)


def expected_net_per_session(p: MartingaleParams) -> float:
    """E[net win] in units of starting_unit. Positive = strategy profits
    on average, Negative = strategy loses on average."""
    p_win = prob_session_win(p)
    max_loss_units = (2 ** _ladder_steps(p.max_steps)) - 1
    return p.starting_unit * (1.0 * p_win + (-max_loss_units) * (1.0 - p_win))


def analytical_rtp(p: MartingaleParams) -> float:
    """Per-unit-bet RTP across the strategy: total expected payout /
    total expected bet."""
    p_win = prob_session_win(p)
    # Total bet under strategy = sum of bets across ladder (truncated by win)
    # E[total bet | win at step k] = 2^k - 1 (sum of geometric series)
    # E[total bet] = Σ_{k=1..N} p_k · (2^k - 1) + (1 - sum) · (2^N - 1)
    p_loss = 1.0 - p.p_win
    total_bet = 0.0
    for k in range(1, _ladder_steps(p.max_steps) + 1):
        prob_win_at_k = (p_loss ** (k - 1)) * p.p_win
        total_bet += prob_win_at_k * (2 ** k - 1)
    # Bust branch
    total_bet += (p_loss ** _ladder_steps(p.max_steps)) * (2 ** _ladder_steps(p.max_steps) - 1)
    # Total payout: on win at step k, player receives 2^k (their doubled
    # bet plus equal pay).
    total_pay = 0.0
    for k in range(1, _ladder_steps(p.max_steps) + 1):
        prob_win_at_k = (p_loss ** (k - 1)) * p.p_win
        total_pay += prob_win_at_k * (2 ** k)
    if total_bet <= 0:
        return 0.0
    return p.starting_unit * total_pay / (p.starting_unit * total_bet)


def mc_simulate(p: MartingaleParams, sessions: int = 200_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_pay = 0.0
    total_bet = 0.0
    busts = 0
    for _ in range(sessions):
        bet = p.starting_unit
        session_bet = 0.0
        session_pay = 0.0
        won = False
        for _ in range(_ladder_steps(p.max_steps)):
            session_bet += bet
            if rng.random() < p.p_win:
                session_pay += 2 * bet
                won = True
                break
            bet *= 2
        if not won:
            busts += 1
        total_pay += session_pay
        total_bet += session_bet
    return {
        "rtp_mc": total_pay / max(total_bet, 1e-9),
        "bust_rate": busts / max(sessions, 1),
    }

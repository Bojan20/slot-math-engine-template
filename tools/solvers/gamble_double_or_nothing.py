"""Closed-form kernel — Gamble Double-or-Nothing.

Industry pattern (Novomatic / Greentube / classic land-based VLT):
after a winning spin, player may gamble the win at fair-ish odds
`p_win_per_round`, doubling on win and losing on loss. Optional
round cap `max_rounds`. Player follows a stopping rule with per-
round continuation probability `p_continue`.

Expected payout from a gamble session starting from win W:
  Let X_k = W · 2^k.
  P(reach round k AND win round k) = p_continue^(k-1) · p_win^k
  E[gamble_payout | W] = Σ_{k=1..K} W · 2^k · p_continue^(k-1) · p_win^k
                       + W · (1 - choice taken in round 0)

Player chooses to enter gamble with probability `p_enter`. If not,
keeps W. So per-trigger expected payout:
  E[gross] = (1 - p_enter) · W + p_enter · E[gamble_payout | W]

Per-spin RTP uplift (relative to "no gamble" baseline):
  uplift = base_hit_freq · base_avg_win · (E[multiplier] - 1)
where E[multiplier] = (1 - p_enter) + p_enter · M and
  M = Σ_{k=1..K} 2^k · p_continue^(k-1) · p_win^k.

Note: if `2 · p_win >= 1` the player has positive EV on each round
and the analytical RTP diverges as K→∞. With p_win = 0.5 and
geometric stopping the operator expectation is unchanged (M = p_enter
contribution = 0); the kernel captures negative drift when 2·p_win < 1.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class GambleParams:
    base_hit_freq: float
    base_avg_win: float
    p_enter: float
    p_win_per_round: float
    p_continue: float          # P(player continues after winning a round)
    max_rounds: int


ACCEPTANCE_TOLERANCE_MC = 0.05


def _multiplier(p_win: float, p_cont: float, max_rounds: int) -> float:
    """Expected payout multiplier (per unit base win) given the gamble was entered.

    The player wagers the base win W. Per round outcomes:
      • win round k (P = p_win) → holds 2^k · W
        ◦ if k < max_rounds: with prob (1 - p_cont) cash out, else continue
        ◦ if k == max_rounds: forced cash-out
      • lose round k (P = 1 - p_win) → busts, payout = 0

    Therefore the per-unit multiplier is:
      Σ_{k=1..K-1} 2^k · p_win^k · p_cont^(k-1) · (1 - p_cont)
      + 2^K · p_win^K · p_cont^(K-1)
    """
    if not (0.0 <= p_win <= 1.0):
        raise ValueError("p_win out of [0, 1]")
    if not (0.0 <= p_cont <= 1.0):
        raise ValueError("p_continue out of [0, 1]")
    if max_rounds <= 0:
        return 1.0
    total = 0.0
    reach = 1.0   # P(reach round k entry point)
    factor = 2.0  # 2^k for k=1
    for k in range(1, max_rounds + 1):
        prob_win_this = reach * p_win
        if k < max_rounds:
            total += factor * prob_win_this * (1.0 - p_cont)
            reach *= p_win * p_cont
        else:
            total += factor * prob_win_this
        factor *= 2.0
        if reach < 1e-15:
            break
    return total


def analytical_rtp(p: GambleParams) -> float:
    if not (0.0 <= p.base_hit_freq <= 1.0):
        raise ValueError("base_hit_freq out of [0, 1]")
    if not (0.0 <= p.p_enter <= 1.0):
        raise ValueError("p_enter out of [0, 1]")
    m = _multiplier(p.p_win_per_round, p.p_continue, p.max_rounds)
    expected_factor = (1.0 - p.p_enter) + p.p_enter * m
    return p.base_hit_freq * p.base_avg_win * expected_factor


def mc_simulate(p: GambleParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    busts = 0
    for _ in range(spins):
        if rng.random() >= p.base_hit_freq:
            continue
        win = p.base_avg_win
        if rng.random() < p.p_enter:
            for _ in range(p.max_rounds):
                if rng.random() < p.p_win_per_round:
                    win *= 2.0
                    if rng.random() >= p.p_continue:
                        break
                else:
                    win = 0.0
                    busts += 1
                    break
        total += win
    return {
        "rtp_mc": total / max(spins, 1),
        "bust_rate": busts / max(spins, 1),
    }

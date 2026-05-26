"""Closed-form kernel — Level-Up Bonus (progressive ladder).

Industry pattern (Vendor C Cleopatra II / Pragmatic Tower / Hacksaw
Le Bandit Climb): each base-game spin contributes a fixed
`level_up_progress` toward filling a meter. When filled, the meter
unlocks Level k+1 with a higher per-spin RTP rate. Levels accumulate
through the session; total session pay is the integral of the
per-level RTP over expected time at each level.

Closed-form
===========

Let:
  meter_per_level = E[spins to fill 1 level]
                  = 1 / level_up_progress    (deterministic gauge)
  session_spins   = total spins in session
  levels_reached  = min(max_level, floor(session_spins / meter_per_level))

For each level L ∈ [0, levels_reached], spent spins = meter_per_level,
contribute `meter_per_level × rtp_at_level[L]` to expected pay.

Boundary: residual spins after the last level contribute at the
top-level rtp.

Acceptance band
===============

MC ratio [0.95, 1.05] @ 5K sessions.
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Sequence


@dataclass
class LevelUpParams:
    rtp_at_level: Sequence[float]       # [level_0_rtp, level_1_rtp, ...]
    level_up_progress: float            # fraction of meter per spin
    session_spins: int
    p_progress_per_spin: float = 1.0    # probability the spin contributes
    max_level: int | None = None


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_levels(p: LevelUpParams) -> float:
    if p.level_up_progress <= 0:
        return 0.0
    eff_progress = p.level_up_progress * p.p_progress_per_spin
    # E[levels] = total_progress × eff_progress, capped at len(rtp) - 1
    raw = p.session_spins * eff_progress
    cap = (p.max_level if p.max_level is not None
           else (len(p.rtp_at_level) - 1))
    return min(raw, float(cap))


def analytical_rtp(p: LevelUpParams) -> float:
    if not p.rtp_at_level:
        return 0.0
    if p.session_spins <= 0:
        return float(p.rtp_at_level[0])
    eff = p.level_up_progress * p.p_progress_per_spin
    if eff <= 0:
        return float(p.rtp_at_level[0])
    meter_spins = 1.0 / eff
    max_lvl = (p.max_level if p.max_level is not None
               else len(p.rtp_at_level) - 1)

    total_pay = 0.0
    spent = 0.0
    for lvl in range(min(max_lvl + 1, len(p.rtp_at_level))):
        if spent + meter_spins <= p.session_spins:
            total_pay += meter_spins * p.rtp_at_level[lvl]
            spent += meter_spins
        else:
            # Remaining time at current level
            total_pay += (p.session_spins - spent) * p.rtp_at_level[lvl]
            spent = p.session_spins
            break
    # Residual spins after we reached top level
    if spent < p.session_spins:
        top = p.rtp_at_level[min(max_lvl, len(p.rtp_at_level) - 1)]
        total_pay += (p.session_spins - spent) * top
    return total_pay / max(p.session_spins, 1)


def mc_simulate(p: LevelUpParams, sessions: int = 5_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total_rtp = 0.0
    levels_reached: list[int] = []
    for _ in range(sessions):
        meter = 0.0
        level = 0
        session_pay = 0.0
        max_lvl = (p.max_level if p.max_level is not None
                   else len(p.rtp_at_level) - 1)
        for _spin in range(p.session_spins):
            session_pay += p.rtp_at_level[
                min(level, len(p.rtp_at_level) - 1)
            ]
            if rng.random() < p.p_progress_per_spin:
                meter += p.level_up_progress
            while meter >= 1.0 and level < max_lvl:
                meter -= 1.0
                level += 1
        levels_reached.append(level)
        total_rtp += session_pay / max(p.session_spins, 1)
    return {
        "rtp_mc": total_rtp / max(sessions, 1),
        "mean_levels_reached": (
            sum(levels_reached) / max(len(levels_reached), 1)
        ),
    }

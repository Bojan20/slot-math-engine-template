"""Closed-form kernel — Multi-Screen Synchronization Bonus.

Industry pattern (Aristocrat Multi-Screen Cabinet, IGT Wheel of
Fortune linked games): N parallel slot screens; when all screens
land the same trigger symbol on a designated cell (P =
`p_align_per_screen`), the unified bonus pays a fixed amount.

Closed-form for independent screens:
  P(all align) = p_align_per_screen ^ n_screens
  uplift = p_align ^ N · bonus_pay
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class MultiScreenSyncParams:
    n_screens: int
    p_align_per_screen: float
    bonus_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def analytical_rtp(p: MultiScreenSyncParams) -> float:
    if not (0.0 <= p.p_align_per_screen <= 1.0):
        raise ValueError("p_align_per_screen out of [0, 1]")
    if p.n_screens <= 0:
        raise ValueError("n_screens must be > 0")
    p_all = p.p_align_per_screen ** p.n_screens
    return p_all * p.bonus_pay


def mc_simulate(p: MultiScreenSyncParams, spins: int = 200_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    aligns = 0
    for _ in range(spins):
        all_align = all(
            rng.random() < p.p_align_per_screen for _ in range(p.n_screens)
        )
        if all_align:
            aligns += 1
            total += p.bonus_pay
    return {
        "rtp_mc": total / max(spins, 1),
        "align_rate": aligns / max(spins, 1),
    }

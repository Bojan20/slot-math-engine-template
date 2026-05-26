"""Closed-form kernel — Tumble Streak Freezer.

Industry pattern (Push Gaming Razor Shark frozen wilds, Pragmatic
Sweet Bonanza freeze multipliers): when a symbol participates in a
winning tumble, it freezes in place for the next `freeze_window`
tumbles. Frozen symbols persist with their bonus state across the
window.

Closed-form per trigger:
  E[wins per session] = 1 / (1 - p_tumble)
  E[freezes per session] = E[wins] · p_freeze_per_win
  uplift = base_pay · E[freezes] · freeze_window_value_mult

For a tractable approximation the kernel takes:
  • p_tumble — geometric tumble continuation
  • p_freeze_per_win — frozen flag per win
  • freeze_window — frozen lifespan in tumbles
  • base_pay
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class TumbleFreezerParams:
    p_trigger: float
    p_tumble: float
    p_freeze_per_win: float
    freeze_window: int
    base_pay: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_wins(p_tumble: float, max_iter: int = 1000) -> float:
    if not (0.0 <= p_tumble < 1.0):
        if p_tumble == 1.0:
            return float(max_iter)
        raise ValueError("p_tumble must be in [0, 1)")
    return 1.0 / (1.0 - p_tumble)


def analytical_rtp(p: TumbleFreezerParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.freeze_window < 0:
        raise ValueError("freeze_window must be >= 0")
    if not (0.0 <= p.p_freeze_per_win <= 1.0):
        raise ValueError("p_freeze_per_win out of [0, 1]")
    wins = expected_wins(p.p_tumble)
    freezes = wins * p.p_freeze_per_win
    # value multiplier: a frozen symbol contributes `freeze_window` more wins
    # at the same base rate, simplified to (1 + freeze_window).
    value_mult = 1.0 + p.freeze_window
    return p.p_trigger * p.base_pay * freezes * value_mult


def mc_simulate(p: TumbleFreezerParams, spins: int = 50_000,
                seed: int = 42, max_tumble: int = 200) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    freezes_total = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        frozen_remaining: list[int] = []
        for _ in range(max_tumble):
            # tumble win occurs each iteration
            win_pay = p.base_pay
            # frozen symbols boost win
            win_pay += sum(p.base_pay for _ in frozen_remaining)
            total += win_pay
            # decrement frozen lifetimes
            frozen_remaining = [t - 1 for t in frozen_remaining if t - 1 > 0]
            # maybe add new freeze
            if rng.random() < p.p_freeze_per_win:
                frozen_remaining.append(p.freeze_window)
                freezes_total += 1
            # continue tumble?
            if rng.random() >= p.p_tumble:
                break
    return {
        "rtp_mc": total / max(spins, 1),
        "freezes_per_spin": freezes_total / max(spins, 1),
    }

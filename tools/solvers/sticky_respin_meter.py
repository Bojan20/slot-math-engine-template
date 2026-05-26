"""Closed-form kernel — Sticky Respin Meter.

Industry pattern (Hold-and-Spin sticky symbols + reset counter):
each respin sticks if a symbol lands (P = `p_land_per_spin`).
The respin counter resets to `respins_reset` each time a new symbol
lands; otherwise it decrements. Session ends when counter reaches 0.

Expected total sticky symbols collected per session follows a
geometric-with-reset Markov chain. Closed-form via Poisson-style
approximation when p_land is small:

  E[sticky_count] ≈ respins_reset · p_land / (1 - (1 - p_land))
                  = respins_reset · 1   (degenerate when p=1)

We solve the Markov chain exactly by iterating until counter
saturates: per "epoch" of respins_reset, P(at least one land) =
1 - (1 - p_land)^respins_reset. Expected number of epochs until
no land = 1 / (1 - q) where q = 1 - (1 - p_land)^respins_reset.

E[total sticky] = E[epochs with land] · E[lands per land-epoch]

Reasonable approximation:
  E[sticky_count] ≈ p_land · respins_reset / (1 - p_land · respins_reset)
                    (geometric expansion if p · respins_reset < 1)

Per-trigger payout = E[sticky_count] · pay_per_sticky.
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class StickyRespinMeterParams:
    p_trigger: float
    p_land_per_spin: float
    respins_reset: int
    pay_per_sticky: float
    max_session_spins: int = 200       # safety cap


ACCEPTANCE_TOLERANCE_MC = 0.10


def _expected_sticky_count(
    p_land: float, respins_reset: int, max_spins: int,
) -> float:
    """Closed-form on a finite horizon by Markov recursion:

      f(k) = expected stickies starting with k respins remaining.
      f(0) = 0.
      f(k) = p_land · (1 + f(respins_reset)) + (1 - p_land) · f(k - 1).
    """
    if respins_reset <= 0:
        return 0.0
    if not (0.0 <= p_land <= 1.0):
        raise ValueError("p_land_per_spin out of [0, 1]")
    # Solve fixed-point iteratively; truncate at max_spins for bounded runtime.
    f = [0.0] * (respins_reset + 1)
    # Iterate until convergence (use max_spins iterations)
    for _ in range(max_spins):
        new_f = list(f)
        for k in range(1, respins_reset + 1):
            new_f[k] = p_land * (1.0 + f[respins_reset]) + (1.0 - p_land) * f[k - 1]
        if all(abs(new_f[k] - f[k]) < 1e-9 for k in range(respins_reset + 1)):
            f = new_f
            break
        f = new_f
    return f[respins_reset]


def analytical_rtp(p: StickyRespinMeterParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.respins_reset <= 0:
        raise ValueError("respins_reset must be > 0")
    ec = _expected_sticky_count(p.p_land_per_spin, p.respins_reset,
                                  p.max_session_spins)
    return p.p_trigger * ec * p.pay_per_sticky


def mc_simulate(p: StickyRespinMeterParams, spins: int = 50_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    counts = []
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        counter = p.respins_reset
        stickies = 0
        for _ in range(p.max_session_spins):
            if counter <= 0:
                break
            if rng.random() < p.p_land_per_spin:
                stickies += 1
                counter = p.respins_reset
            else:
                counter -= 1
        counts.append(stickies)
        total += stickies * p.pay_per_sticky
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_stickies_per_trigger": sum(counts) / max(len(counts), 1),
    }

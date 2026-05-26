"""Closed-form kernel — Wild Path Clear (single-reel sweep).

Industry pattern (Vendor C Cleopatra II "Path of Coins" / Hacksaw
Mining Pots "Sweep" / Pragmatic "Pyro Wild"): a special wild lands
on a single reel and "sweeps" across remaining reels, leaving wilds
in its trail with probability `p_continue` each step.

Closed-form
===========

Let:
  reels                 = total reels
  p_trigger             = P(sweep wild lands at reel 0)
  p_continue            = P(sweep advances 1 reel further given alive)
  reward_per_reel       = pay added per reel covered

Geometric chain length until break:
  E[L | reels] = Σ_{k=1..reels} k × (1 − p) × p^(k−1) + reels × p^reels
              = (1 − p^reels) / (1 − p)              (geometric mean capped)

Per-spin RTP:
  ΔRTP = p_trigger × E[L] × reward_per_reel
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class WildPathClearParams:
    p_trigger: float
    p_continue: float
    reels: int
    reward_per_reel: float


ACCEPTANCE_TOLERANCE_MC = 0.02


def expected_path_length(p: WildPathClearParams) -> float:
    if not (0.0 <= p.p_continue < 1.0):
        if p.p_continue == 1.0:
            return float(p.reels)
        raise ValueError("p_continue must be in [0, 1)")
    if p.reels <= 0:
        return 0.0
    # E[L] = (1 - p^N) / (1 - p) capped at N (geometric with cap)
    if p.p_continue == 0.0:
        return 1.0  # always reaches at least reel 0
    e_l = (1.0 - p.p_continue ** p.reels) / (1.0 - p.p_continue)
    return min(e_l, float(p.reels))


def analytical_rtp(p: WildPathClearParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    return p.p_trigger * expected_path_length(p) * p.reward_per_reel


def mc_simulate(p: WildPathClearParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    total = 0.0
    lengths: list[int] = []
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        length = 1   # reel 0 is always reached on trigger
        while length < p.reels and rng.random() < p.p_continue:
            length += 1
        total += length * p.reward_per_reel
        lengths.append(length)
    return {
        "rtp_mc": total / max(spins, 1),
        "trigger_rate": triggers / max(spins, 1),
        "mean_length": (sum(lengths) / max(len(lengths), 1)) if lengths else 0.0,
    }

"""Closed-form kernel — Lightning Bomb Multiplier.

Industry pattern (Pragmatic Lightning Link Heart Throb / Hacksaw
Wanted Dead Bomb / Vendor A Lightning Strike): with probability
`p_trigger`, M bombs land on the grid and each bomb carries a
random multiplier drawn iid from `mult_dist`. Any line wins that
touch a bomb cell are multiplied by Π M_i (product of touched
multipliers). Approximation: bomb cells are uniformly random
across the grid; per-line "is touched" indicator is independent.

Closed-form
===========

Let:
  E[M]  = Σ_v p_v × v          (per-bomb multiplier mean)
  m     = number of bombs landed (constant or geometric)
  n_cells = reels × rows
  P(line touches >= 1 bomb)
        = 1 - (1 - reels / n_cells)^m  ≈ m × reels / n_cells (small m)

Expected per-line uplift (given base win):
  E[uplift] = (1 - P_touch) × 1 + P_touch × E[M^k] for k touched bombs
  Under per-line independence + small m:
    E[uplift] ≈ 1 + m × (E[M] - 1) × reels / n_cells

Per-spin RTP contribution (uplift × baseline win):
  ΔRTP = p_trigger × (E[uplift] - 1) × base_line_rtp

Acceptance band
===============

MC ratio [0.85, 1.15] @ 100K spins (independence approximation
introduces ≤10% bias).
"""
from __future__ import annotations
import random
from dataclasses import dataclass
from typing import Mapping


@dataclass
class LightningBombParams:
    p_trigger: float
    n_bombs: int          # constant number of bombs per trigger
    reels: int
    rows: int
    mult_dist: Mapping[int, float]   # {multiplier: probability}, Σ p = 1
    base_line_rtp: float
    n_lines: int = 20


ACCEPTANCE_TOLERANCE_MC = 0.10


def expected_multiplier(p: LightningBombParams) -> float:
    return sum(float(v) * float(pv) for v, pv in p.mult_dist.items())


def analytical_rtp(p: LightningBombParams) -> float:
    if not (0.0 <= p.p_trigger <= 1.0):
        raise ValueError("p_trigger out of [0, 1]")
    if p.reels <= 0 or p.rows <= 0:
        raise ValueError("dimensions must be positive")
    em = expected_multiplier(p)
    n_cells = p.reels * p.rows
    p_touch = p.n_bombs * p.reels / max(n_cells, 1)
    uplift = 1.0 + p_touch * (em - 1.0)
    return p.p_trigger * (uplift - 1.0) * p.base_line_rtp


def mc_simulate(p: LightningBombParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    n_cells = p.reels * p.rows
    multipliers = list(p.mult_dist.keys())
    weights = [p.mult_dist[k] for k in multipliers]
    total_uplift = 0.0
    triggers = 0
    for _ in range(spins):
        if rng.random() >= p.p_trigger:
            continue
        triggers += 1
        # Place n_bombs at distinct random cells
        bomb_cells = rng.sample(range(n_cells),
                                  min(p.n_bombs, n_cells))
        # Per-line touched bombs
        for _line in range(p.n_lines):
            # Each line has 1 cell per reel — pick uniformly random row
            line_cells = {rng.randrange(p.rows) + reel * p.rows
                            for reel in range(p.reels)}
            touched = [c for c in bomb_cells if c in line_cells]
            if touched:
                prod = 1.0
                for _t in touched:
                    m = rng.choices(multipliers, weights=weights, k=1)[0]
                    prod *= m
                total_uplift += (prod - 1.0)
    rtp_uplift = total_uplift * p.base_line_rtp / max(spins * p.n_lines, 1)
    return {
        "rtp_mc": rtp_uplift,
        "trigger_rate": triggers / max(spins, 1),
    }

"""Closed-form kernel — Walking Wild Persistence.

Industry pattern (NetEnt Jack Hammer Walking Wilds, Yggdrasil
Vikings persistent wild): once a wild lands on reel j, on the next
spin it walks one position to reel j+1 (or j-1) and stays. It pays
its column value while present. Wild despawns when it walks off
the grid.

For a 5-reel grid:
  • A wild seeded at column c persists for (reels - c) spins.
  • Each spin it contributes one "wild column" to all paylines that
    cross that column.

Closed-form per spawn at uniform random column:
  E[lifetime] = (reels + 1) / 2
  uplift_per_walking_wild = E[lifetime] · avg_per_spin_contribution

Per-spin trigger rate `p_spawn`. Per-spin uplift:
  uplift_per_spin = p_spawn · E[lifetime] · avg_contribution
"""
from __future__ import annotations
import random
from dataclasses import dataclass


@dataclass
class WalkingWildParams:
    reels: int
    p_spawn: float
    avg_contribution_per_spin: float


ACCEPTANCE_TOLERANCE_MC = 0.05


def expected_lifetime(reels: int) -> float:
    if reels <= 0:
        raise ValueError("reels must be > 0")
    # Mean of lifetime r when spawned uniformly on [0, reels-1]:
    # lifetime = reels - c → mean = (reels + 1) / 2
    return (reels + 1) / 2.0


def analytical_rtp(p: WalkingWildParams) -> float:
    if not (0.0 <= p.p_spawn <= 1.0):
        raise ValueError("p_spawn out of [0, 1]")
    return p.p_spawn * expected_lifetime(p.reels) * p.avg_contribution_per_spin


def mc_simulate(p: WalkingWildParams, spins: int = 100_000,
                seed: int = 42) -> dict[str, float]:
    rng = random.Random(seed)
    active: list[int] = []  # column positions of currently-active wilds
    total = 0.0
    for _ in range(spins):
        # Existing wilds walk one column right
        active = [c + 1 for c in active if c + 1 < p.reels]
        # Possibly spawn a new wild
        if rng.random() < p.p_spawn:
            c0 = rng.randrange(p.reels)
            active.append(c0)
        total += len(active) * p.avg_contribution_per_spin
    return {
        "rtp_mc": total / max(spins, 1),
        "avg_active": total / max(spins * p.avg_contribution_per_spin, 1e-9),
    }

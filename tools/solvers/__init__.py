"""P1.6 — Closed-form solver kernels.

Each kernel computes an analytical RTP / probability for a specific
industry pattern (stacked wild, symbol upgrade, mystery reveal, etc.)
with a deterministic formula that the engine MC then verifies within
a published tolerance.

Conventions per kernel:

  ▸ Pure-Python dataclass parameter struct
  ▸ `analytical_rtp(params) -> float` — closed-form expected RTP
  ▸ `mc_simulate(params, spins, seed) -> dict` — reference MC run
  ▸ `acceptance_tolerance` — published convergence band (e.g. 0.5%)
  ▸ Test that analytical ↔ MC agree to within tolerance

These kernels are independent of the universal IR engine — they let a
designer estimate RTP for a candidate spec in milliseconds before
committing to a full MC verification.
"""

from .stacked_wild_random_reel import (
    StackedWildRandomReelParams,
    analytical_rtp as stacked_wild_rtp,
    mc_simulate as stacked_wild_mc,
)
from .symbol_upgrade_random import (
    SymbolUpgradeParams,
    analytical_rtp as symbol_upgrade_rtp,
    mc_simulate as symbol_upgrade_mc,
)
from .mystery_reveal_aggregator import (
    MysteryRevealParams,
    analytical_rtp as mystery_reveal_rtp,
    mc_simulate as mystery_reveal_mc,
)
from .cluster_pays_variance import (
    ClusterPaysParams,
    analytical_rtp as cluster_pays_rtp,
    mc_simulate as cluster_pays_mc,
)
from .bonus_wheel_markov import (
    BonusWheelParams,
    WheelSegment,
    analytical_rtp as bonus_wheel_rtp,
    mc_simulate as bonus_wheel_mc,
    expected_chain_length as bonus_wheel_chain,
)

__all__ = [
    "StackedWildRandomReelParams",
    "stacked_wild_rtp",
    "stacked_wild_mc",
    "SymbolUpgradeParams",
    "symbol_upgrade_rtp",
    "symbol_upgrade_mc",
    "MysteryRevealParams",
    "mystery_reveal_rtp",
    "mystery_reveal_mc",
    "ClusterPaysParams",
    "cluster_pays_rtp",
    "cluster_pays_mc",
    "BonusWheelParams",
    "WheelSegment",
    "bonus_wheel_rtp",
    "bonus_wheel_mc",
    "bonus_wheel_chain",
]

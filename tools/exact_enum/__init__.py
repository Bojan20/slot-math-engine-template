"""W81 — Exact Enumeration Engine v3.

Computes ground-truth RTP by EXHAUSTIVE enumeration of every
reel-position combination, not Monte Carlo. For small enough
grids (≤ a few million combinations) this gives the mathematically
exact RTP — every measurement question reduces to deterministic
counting.

Use cases
=========
  * **Truth gate**: MC says RTP=0.9601 ± 0.005; enumerator says
    RTP=0.96000000 exactly. Acceptance lab paperwork.
  * **Closed-form verification**: when W81 + a closed-form kernel
    agree on RTP to 10 decimal places, the kernel is provably
    correct (modulo the model).
  * **Variance / max-win exact**: gives σ², max single-spin pay,
    and the entire pay distribution histogram exactly.

The enumerator scales as Π_r |reel_r|. Refuses to run if the
combination count exceeds `max_combinations` (default 50M) to
keep CI runs deterministic.
"""
from tools.exact_enum.engine import (
    ExactEnumReport,
    PayHistogramEntry,
    enumerate_exact,
    combination_count,
)

__all__ = [
    "ExactEnumReport",
    "PayHistogramEntry",
    "enumerate_exact",
    "combination_count",
]

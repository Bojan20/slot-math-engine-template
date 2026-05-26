"""W30 — A/B Test Framework for slot-math IR variants.

Compares 2 IR variants (A vs B) via the engine-free synthetic
cohort simulator (W17 sampler). For each variant:

  • N players × M spins
  • Compute bust rate, mean end-bankroll, mean session RTP, mean
    big-win frequency

Then produces a fitness vector + verdict (A wins / B wins / tie).
Uses a two-sample t-test on the per-player end-bankroll % to mark
results "statistically significant" at α=0.05.
"""
from tools.ab_test.framework import (
    ABVariantResult,
    ABComparison,
    compare_irs,
)

__all__ = [
    "ABVariantResult",
    "ABComparison",
    "compare_irs",
]

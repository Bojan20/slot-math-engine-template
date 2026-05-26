"""W35 — IR Diff Heatmap.

Compares 2 universal IR JSONs and emits a structural diff plus
a per-field impact rating. Designed for designer code review:

  • What changed structurally? (added/removed/modified leaves)
  • Which changes are high-impact (paytable pays, reel strips,
    feature trigger probs) vs low-impact (meta.notes, asset paths)?
  • Aggregate score per category → "heatmap" of risk.

Output: structured dict + optional Markdown rendering.
"""
from tools.ir_diff_heatmap.differ import (
    Change,
    DiffReport,
    diff_irs,
    render_markdown,
    HIGH_IMPACT_PREFIXES,
)

__all__ = [
    "Change",
    "DiffReport",
    "diff_irs",
    "render_markdown",
    "HIGH_IMPACT_PREFIXES",
]

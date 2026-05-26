"""W39 — Portfolio Comparator.

Multi-IR comparator that produces an at-a-glance dashboard of how
games in a portfolio stack up on key dimensions:

  • Target RTP, paytable size, feature count
  • Vendor / topology distribution
  • Closed-form coverage (which P1.6 kernels are referenced)

Output: structured dict + Markdown table. Useful for studio
release planning and regulator portfolio submissions.
"""
from tools.portfolio_compare.comparator import (
    GameSummary,
    PortfolioReport,
    summarize_ir,
    compare,
    render_markdown,
)

__all__ = [
    "GameSummary",
    "PortfolioReport",
    "summarize_ir",
    "compare",
    "render_markdown",
]

"""W12 — Multi-IR Portfolio Analyzer.

Reads N universal IRs from a games directory or explicit list,
computes per-IR metrics (Bernoulli RTP estimate, hit-freq estimate,
feature-coverage fingerprint, paytable depth, reel diversity index),
and emits:

  • portfolio.json   — full metrics matrix
  • portfolio.md     — side-by-side comparison table
  • portfolio.html   — interactive sortable dashboard with Pareto chart
                       (RTP × Volatility), feature heatmap, and
                       click-to-drill per-IR view.

Use cases:
  • Game-studio: ship a release branch + see at-a-glance the RTP /
    volatility spread of the portfolio so the studio knows the next
    game should target the under-represented volatility band.
  • Operator: integrate as a `slot-ci-gate` follow-up to verify the
    portfolio satisfies a market-mix target (e.g. ≥3 high-vol, ≤2
    must-be-medium games).
"""
from tools.portfolio.analyzer import (
    IRMetrics,
    PortfolioReport,
    analyze_portfolio,
    metrics_for_ir,
)

__all__ = [
    "IRMetrics",
    "PortfolioReport",
    "analyze_portfolio",
    "metrics_for_ir",
]

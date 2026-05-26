"""W40 — Volatility Classifier.

Maps simulated session statistics → volatility tier label and an
explanatory ribbon. Standard industry tiers:

  • LOW      σ/μ < 1.5
  • MEDIUM   1.5 ≤ σ/μ < 3.0
  • HIGH     3.0 ≤ σ/μ < 6.0
  • EXTREME  σ/μ ≥ 6.0

Inputs: per-spin payout list OR (mean_pay, stddev_pay). Output:
tier + numerical CV + tier-rationale string.
"""
from tools.volatility_classifier.classifier import (
    VolTier,
    VolatilityReport,
    classify,
    classify_from_samples,
    TIER_THRESHOLDS,
)

__all__ = [
    "VolTier",
    "VolatilityReport",
    "classify",
    "classify_from_samples",
    "TIER_THRESHOLDS",
]

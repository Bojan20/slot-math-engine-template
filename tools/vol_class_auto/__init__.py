"""PHASE 35 — Auto Volatility Classifier.

Classifies a slot game into UKGC RTS 7.4 volatility band (low / medium
/ high / ultra) using closed-form coefficient-of-variation (σ/μ) of
per-spin payouts.

Bands (industry-standard 2024):
  CV ≤ 1.5         → low
  1.5 < CV ≤ 4     → medium
  4   < CV ≤ 10    → high
  CV > 10          → ultra

Public API:
    from tools.vol_class_auto import classify_volatility, VolReport
"""

from __future__ import annotations

from tools.vol_class_auto.classifier import (
    classify_volatility,
    VolReport,
)

__all__ = ["classify_volatility", "VolReport"]

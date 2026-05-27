"""PHASE 29 — ML-Free Drift Anomaly Detector.

Three classical change-point detectors, all stateful streaming:

  - **EWMA** (Exponentially-Weighted Moving Average) sa upper / lower
    control limits at z·σ
  - **CUSUM** (Cumulative SUM) sa two-sided threshold h
  - **Page-Hinkley** sa decision threshold + min-amplitude δ

Each emits `is_alerting=True` on first crossing; subsequent calls can
auto-reset via configurable policy.

Pure stdlib. No external ML lib.

Public API:
    from tools.drift_detector import (
        EWMA, CUSUM, PageHinkley,
        DriftSignal,
    )
"""

from __future__ import annotations

from tools.drift_detector.detectors import (
    EWMA,
    CUSUM,
    PageHinkley,
    DriftSignal,
)

__all__ = ["EWMA", "CUSUM", "PageHinkley", "DriftSignal"]

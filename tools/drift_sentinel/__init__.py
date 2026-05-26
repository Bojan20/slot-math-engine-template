"""W11 — Drift Sentinel.

Single-invocation CI gate that scans every IR in a games directory,
computes a stable structural fingerprint + Bernoulli RTP estimate
per IR, and reports drift against a persisted baseline.

  • First run on a fresh tree → all IRs are NEW, baseline is seeded.
  • Subsequent runs → drift is classified as green / yellow / red based
    on absolute RTP delta vs the baseline. New IRs are reported.
    Removed IRs are reported. Hash-only changes (paytable / reel
    structure shift) are surfaced even when the RTP estimate did
    not move.

This is NOT a regulator-grade MC gate — it is a *change detector*
that protects against silent IR drift between commits / branches.
"""
from tools.drift_sentinel.sentinel import (
    DriftClass,
    DriftEntry,
    DriftReport,
    scan_directory,
)
from tools.drift_sentinel.baselines import (
    BaselineStore,
    load_baselines,
    save_baselines,
)

__all__ = [
    "DriftClass",
    "DriftEntry",
    "DriftReport",
    "scan_directory",
    "BaselineStore",
    "load_baselines",
    "save_baselines",
]

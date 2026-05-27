"""PHASE 37 — Auto-Regression-Suite Generator.

From any IR + expected RTP, auto-generate a pytest spec that pins:
  - canonical IR hash (anti-tamper)
  - Bernoulli RTP estimate within tolerance
  - paytable consistency invariants
  - reel-weight positivity
  - max-win cap compliance

Output: ready-to-drop-in `tests/test_regression_<slug>.py`.

Public API:
    from tools.regen_suite import generate_regression_spec, RegressionSpec
"""

from __future__ import annotations

from tools.regen_suite.generator import (
    RegressionSpec,
    generate_regression_spec,
)

__all__ = ["RegressionSpec", "generate_regression_spec"]

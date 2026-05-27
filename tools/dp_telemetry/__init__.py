"""PHASE 28 — Differential-Privacy RGS Telemetry.

ε-DP gate for player-data exports. Two mechanisms:

  - **Laplace mechanism** for numeric stats with sensitivity Δ:
        noisy = true + Lap(Δ / ε)

  - **Gaussian mechanism** for (ε, δ)-DP:
        σ = Δ · √(2·ln(1.25/δ)) / ε
        noisy = true + Normal(0, σ²)

Budget tracker enforces per-query ε accounting + raises when total
ε spent exceeds the global cap.

Public API:
    from tools.dp_telemetry import (
        PrivacyBudget,
        laplace_mechanism,
        gaussian_mechanism,
    )
"""

from __future__ import annotations

from tools.dp_telemetry.dp import (
    PrivacyBudget,
    PrivacyBudgetExhausted,
    laplace_mechanism,
    gaussian_mechanism,
)

__all__ = [
    "PrivacyBudget",
    "PrivacyBudgetExhausted",
    "laplace_mechanism",
    "gaussian_mechanism",
]

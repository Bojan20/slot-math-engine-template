"""PHASE 31 — Player Lifetime Value (LTV) Forecaster.

Closed-form geometric-decay LTV + simulation harness for cohort-level
horizon estimates. Operator-facing, vendor-neutral.

LTV model (closed form):
    LTV = avg_deposit_per_session × Σ_{t=0..H} retention^t × (1 − house_take)
        = avg_deposit × (1 − retention^(H+1)) / (1 − retention) × (1 − house_take)
  (for retention ∈ [0, 1) and finite horizon H; infinite horizon →
  divides by (1 − retention))

Public API:
    from tools.ltv_forecast import (
        LTVInputs,
        LTVResult,
        forecast_closed_form,
        simulate_ltv_cohort,
    )
"""

from __future__ import annotations

from tools.ltv_forecast.forecaster import (
    LTVInputs,
    LTVResult,
    forecast_closed_form,
    simulate_ltv_cohort,
)

__all__ = ["LTVInputs", "LTVResult", "forecast_closed_form", "simulate_ltv_cohort"]

"""PHASE 25 — Continuous-Time Live Stress Model.

Hawkes self-exciting process simulator for peak-load capacity planning
on PHASE 12 RGS Live. Models bursts of player activity (rush after
jackpot fire, marketing event, etc.) and reports load-percentile
projections.

Public API:
    from tools.stress_model import (
        HawkesParams,
        StressReport,
        simulate_hawkes,
        capacity_report,
    )
"""

from __future__ import annotations

from tools.stress_model.hawkes import (
    HawkesParams,
    StressReport,
    simulate_hawkes,
    capacity_report,
)

__all__ = ["HawkesParams", "StressReport", "simulate_hawkes", "capacity_report"]

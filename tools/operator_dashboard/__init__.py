"""W57 — Operator Dashboard Aggregator.

Combines every per-game signal — Bernoulli RTP estimate (drift_sentinel),
volatility proxy (portfolio), feature kinds, telemetry presence — into
one HTML dashboard + JSON summary. Each game gets a traffic-light
verdict (green/yellow/red) computed by stacking the signals.

Entry: ``aggregate(games_root, …)`` → ``DashboardReport``.
CLI:   ``slot-operator-dashboard <games_root> --out <dir>``.
"""
from tools.operator_dashboard.aggregator import (
    DashboardReport,
    GameSummary,
    aggregate,
    emit_dashboard,
)

__all__ = [
    "DashboardReport",
    "GameSummary",
    "aggregate",
    "emit_dashboard",
]

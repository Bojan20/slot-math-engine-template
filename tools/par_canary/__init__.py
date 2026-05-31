"""SLOT-MATH Faza 6.1 — Live A/B canary deploy.

After promote, designer can OPTIONALLY split live traffic between two
variants (live + canary) and measure conversion deltas in real time.

Player routing:
  - Hash(player_id + game_id) modulo 100 → bucket
  - bucket < canary_pct → canary variant
  - bucket >= canary_pct → live variant

Per-session sticky: same player_id always lands on same variant
across spins, so no cross-variant leakage within one session.

Audit trail: every spin's variant_id pinned in audit log alongside
PAR Merkle, so regulator can prove which math served which spin.
"""
from tools.par_canary.router import (
    CanaryConfig,
    pick_variant_for_player,
    route_session,
)
from tools.par_canary.kpi_diff import (
    KpiSnapshot,
    SignificanceVerdict,
    compute_kpi_diff,
    is_statistically_significant,
)

__all__ = [
    "CanaryConfig",
    "pick_variant_for_player",
    "route_session",
    "KpiSnapshot",
    "SignificanceVerdict",
    "compute_kpi_diff",
    "is_statistically_significant",
]

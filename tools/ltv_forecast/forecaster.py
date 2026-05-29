"""PHASE 31 — LTV forecaster kernel."""

from __future__ import annotations

import random
from dataclasses import dataclass, field


@dataclass(frozen=True)
class LTVInputs:
    avg_deposit_per_session: float
    retention: float                  # P(player returns next session)
    house_take_rate: float            # 1 − RTP, share kept by house
    horizon_sessions: int | None = None  # None → infinite

    def __post_init__(self) -> None:
        if self.avg_deposit_per_session < 0:
            raise ValueError("avg_deposit_per_session must be ≥ 0")
        if not 0 <= self.retention < 1:
            raise ValueError("retention must be in [0, 1)")
        if not 0 <= self.house_take_rate <= 1:
            raise ValueError("house_take_rate must be in [0, 1]")
        if self.horizon_sessions is not None and self.horizon_sessions < 1:
            raise ValueError("horizon_sessions must be ≥ 1 if set")


@dataclass
class LTVResult:
    schema_version: str = "urn:slotmath:ltv-forecast:v1"
    closed_form_ltv: float = 0.0
    horizon_used: str = ""           # "infinite" or "H=N"
    expected_sessions: float = 0.0
    breakdown: dict[str, float] = field(default_factory=dict)


def forecast_closed_form(inputs: LTVInputs) -> LTVResult:
    """Closed-form LTV under geometric retention."""
    avg = inputs.avg_deposit_per_session
    r = inputs.retention
    take = inputs.house_take_rate
    if inputs.horizon_sessions is None:
        # Infinite horizon
        if r == 0:
            sessions = 1.0
            session_sum = 1.0
        else:
            session_sum = 1.0 / (1.0 - r)
            sessions = session_sum
        horizon_label = "infinite"
    else:
        H = inputs.horizon_sessions
        if r == 0:
            session_sum = 1.0
        else:
            session_sum = (1.0 - r ** (H + 1)) / (1.0 - r)
        sessions = session_sum
        horizon_label = f"H={H}"

    ltv = avg * session_sum * take
    return LTVResult(
        closed_form_ltv=round(ltv, 8),
        horizon_used=horizon_label,
        expected_sessions=round(sessions, 6),
        breakdown={
            "avg_deposit_per_session": avg,
            "retention": r,
            "house_take_rate": take,
            "session_sum_factor": session_sum,
        },
    )


def simulate_ltv_cohort(
    inputs: LTVInputs,
    *,
    n_players: int = 1000,
    seed: int = 0xb01_dface,
) -> float:
    """MC: simulate `n_players` cohorts; return mean total house take."""
    if n_players < 1:
        raise ValueError("n_players must be ≥ 1")
    rng = random.Random(seed)
    total_house = 0.0
    h = inputs.horizon_sessions
    for _ in range(n_players):
        sessions = 0
        while True:
            sessions += 1
            if h is not None and sessions >= h:
                break
            if rng.random() >= inputs.retention:
                break
        total_house += (
            sessions
            * inputs.avg_deposit_per_session
            * inputs.house_take_rate
        )
    return total_house / n_players

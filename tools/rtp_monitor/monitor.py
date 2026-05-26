"""Live RTP Monitor — rolling/EWMA/drift stats on a spin stream."""
from __future__ import annotations
import collections
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


@dataclass
class RtpSnapshot:
    spins: int
    total_bet: float
    total_pay: float
    cumulative_rtp: float
    rolling_rtp: float | None
    ewma_rtp: float
    hit_freq: float
    win_freq: float
    drift_abs: float | None
    drift_severity: str       # green | yellow | red | none
    anomalies: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "spins": self.spins,
            "total_bet": self.total_bet,
            "total_pay": self.total_pay,
            "cumulative_rtp": self.cumulative_rtp,
            "rolling_rtp": self.rolling_rtp,
            "ewma_rtp": self.ewma_rtp,
            "hit_freq": self.hit_freq,
            "win_freq": self.win_freq,
            "drift_abs": self.drift_abs,
            "drift_severity": self.drift_severity,
            "anomalies": self.anomalies,
        }


@dataclass
class MonitorState:
    target_rtp: float | None = None
    rolling_window: int = 1000
    ewma_alpha: float = 0.01
    anomaly_z: float = 3.0

    spins: int = 0
    total_bet: float = 0.0
    total_pay: float = 0.0
    hits: int = 0
    wins: int = 0
    ewma: float = 0.0
    anomalies: int = 0

    # rolling buffer of (bet, pay) so we can compute window RTP
    _buf: collections.deque = field(default_factory=collections.deque)
    _rolling_bet: float = 0.0
    _rolling_pay: float = 0.0


def classify_drift(delta_abs: float | None) -> str:
    if delta_abs is None:
        return "none"
    if delta_abs < 0.005:
        return "green"
    if delta_abs < 0.01:
        return "yellow"
    return "red"


def update_from_spin(
    state: MonitorState,
    *,
    bet: float,
    pay: float,
    win_count: int = 0,
) -> RtpSnapshot:
    """Update state with one spin and return a fresh snapshot."""
    state.spins += 1
    state.total_bet += bet
    state.total_pay += pay
    if pay > 0:
        state.hits += 1
    state.wins += win_count

    # Rolling buffer
    state._buf.append((bet, pay))
    state._rolling_bet += bet
    state._rolling_pay += pay
    while len(state._buf) > state.rolling_window:
        b0, p0 = state._buf.popleft()
        state._rolling_bet -= b0
        state._rolling_pay -= p0

    cumulative = state.total_pay / max(state.total_bet, 1e-12)

    if state._rolling_bet > 0:
        rolling = state._rolling_pay / state._rolling_bet
    else:
        rolling = None

    # EWMA seeded on first spin
    if state.spins == 1:
        state.ewma = cumulative
    else:
        sample = (pay / max(bet, 1e-12))
        state.ewma = state.ewma + state.ewma_alpha * (sample - state.ewma)

    drift_abs = None
    if state.target_rtp is not None and rolling is not None:
        drift_abs = abs(rolling - state.target_rtp)
        # anomaly if rolling deviates beyond z×σ where σ ≈ sqrt(p(1-p)/n)
        # very rough Bernoulli-pay approx
        n = max(state.rolling_window, 1)
        sigma = math.sqrt(max(state.target_rtp * (1 - state.target_rtp), 1e-6) / n)
        if drift_abs > state.anomaly_z * sigma:
            state.anomalies += 1

    hit_freq = state.hits / max(state.spins, 1)
    win_freq = state.wins / max(state.spins, 1)

    return RtpSnapshot(
        spins=state.spins,
        total_bet=state.total_bet,
        total_pay=state.total_pay,
        cumulative_rtp=cumulative,
        rolling_rtp=rolling,
        ewma_rtp=state.ewma,
        hit_freq=hit_freq,
        win_freq=win_freq,
        drift_abs=drift_abs,
        drift_severity=classify_drift(drift_abs),
        anomalies=state.anomalies,
    )


def update_from_stream(
    state: MonitorState,
    events: Iterable[dict[str, Any]],
) -> list[RtpSnapshot]:
    """Consume a stream of spin events and return per-spin snapshots.

    Each event must have at least `bet` and `pay` keys; `win_count`
    is optional.
    """
    snapshots: list[RtpSnapshot] = []
    for ev in events:
        bet = float(ev.get("bet", 1.0))
        pay = float(ev.get("pay", 0.0))
        wc = int(ev.get("win_count", 0))
        snapshots.append(
            update_from_spin(state, bet=bet, pay=pay, win_count=wc)
        )
    return snapshots


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out

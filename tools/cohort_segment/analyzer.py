"""Cohort segment analyzer — JSONL spin log → per-segment summary."""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable


@dataclass
class SegmentStats:
    segment: str
    n_players: int = 0
    total_bet: float = 0.0
    total_pay: float = 0.0
    total_spins: int = 0
    n_busts: int = 0

    @property
    def rtp(self) -> float:
        return self.total_pay / self.total_bet if self.total_bet > 0 else 0.0

    @property
    def avg_spins(self) -> float:
        return self.total_spins / self.n_players if self.n_players else 0.0

    @property
    def bust_rate(self) -> float:
        return self.n_busts / self.n_players if self.n_players else 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "segment": self.segment,
            "n_players": self.n_players,
            "total_bet": self.total_bet,
            "total_pay": self.total_pay,
            "total_spins": self.total_spins,
            "rtp": self.rtp,
            "avg_spins": self.avg_spins,
            "bust_rate": self.bust_rate,
        }


@dataclass
class CohortReport:
    segments: dict[str, SegmentStats] = field(default_factory=dict)
    n_events: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_events": self.n_events,
            "segments": {k: v.to_dict() for k, v in self.segments.items()},
        }


def _quantile(sorted_vals: list[float], q: float) -> float:
    if not sorted_vals:
        return 0.0
    if q <= 0:
        return sorted_vals[0]
    if q >= 1:
        return sorted_vals[-1]
    pos = q * (len(sorted_vals) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(sorted_vals) - 1)
    frac = pos - lo
    return sorted_vals[lo] * (1 - frac) + sorted_vals[hi] * frac


def classify_segments(
    player_avg_bets: dict[str, float],
    *,
    q_low: float = 0.33,
    q_high: float = 0.66,
) -> dict[str, str]:
    """Return player_id → segment ("low" | "mid" | "high")."""
    if not player_avg_bets:
        return {}
    sorted_bets = sorted(player_avg_bets.values())
    threshold_low = _quantile(sorted_bets, q_low)
    threshold_high = _quantile(sorted_bets, q_high)
    out: dict[str, str] = {}
    for pid, avg_bet in player_avg_bets.items():
        if avg_bet < threshold_low:
            out[pid] = "low"
        elif avg_bet < threshold_high:
            out[pid] = "mid"
        else:
            out[pid] = "high"
    return out


def aggregate(
    events: Iterable[dict[str, Any]],
    *,
    bust_threshold: float = 0.0,
) -> CohortReport:
    """Aggregate per-spin events into per-segment stats."""
    by_player: dict[str, dict[str, float]] = {}
    n_events = 0
    for ev in events:
        n_events += 1
        pid = str(ev.get("player_id", "unknown"))
        bet = float(ev.get("bet", 0.0))
        pay = float(ev.get("pay", 0.0))
        rec = by_player.setdefault(pid, {
            "total_bet": 0.0, "total_pay": 0.0, "n_spins": 0,
            "end_balance": 0.0,
        })
        rec["total_bet"] += bet
        rec["total_pay"] += pay
        rec["n_spins"] += 1
        rec["end_balance"] += pay - bet

    avg_bets = {
        pid: (rec["total_bet"] / rec["n_spins"] if rec["n_spins"] > 0 else 0.0)
        for pid, rec in by_player.items()
    }
    seg_map = classify_segments(avg_bets)

    segments = {s: SegmentStats(segment=s) for s in ("low", "mid", "high")}
    for pid, rec in by_player.items():
        s = seg_map.get(pid, "mid")
        stats = segments[s]
        stats.n_players += 1
        stats.total_bet += rec["total_bet"]
        stats.total_pay += rec["total_pay"]
        stats.total_spins += int(rec["n_spins"])
        if rec["end_balance"] < bust_threshold:
            stats.n_busts += 1

    return CohortReport(segments=segments, n_events=n_events)


def analyze_jsonl(
    path: Path | str, *, bust_threshold: float = 0.0,
) -> CohortReport:
    path = Path(path)
    events = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return aggregate(events, bust_threshold=bust_threshold)

"""Drift replay theatre — throttled historical NDJSON re-feeder."""
from __future__ import annotations
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterable

from tools.rtp_monitor.monitor import MonitorState
from tools.drift_alert_hub.hub import AlertHub
from tools.telemetry_bridge.bridge import bridge_iterable, BridgeReport


@dataclass
class ReplayTick:
    sequence: int
    event_ts: float | None
    sleep_seconds: float
    spins_consumed_at_tick: int
    snapshot_emitted: bool
    alerts_at_tick: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "sequence": self.sequence,
            "event_ts": self.event_ts,
            "sleep_seconds": self.sleep_seconds,
            "spins_consumed_at_tick": self.spins_consumed_at_tick,
            "snapshot_emitted": self.snapshot_emitted,
            "alerts_at_tick": self.alerts_at_tick,
        }


@dataclass
class DriftReplayReport:
    bridge_report: BridgeReport
    ticks: list[ReplayTick] = field(default_factory=list)
    total_wall_seconds: float = 0.0
    speedup: float = 0.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "bridge_report": self.bridge_report.to_dict(),
            "n_ticks": len(self.ticks),
            "total_wall_seconds": self.total_wall_seconds,
            "speedup": self.speedup,
            "ticks": [t.to_dict() for t in self.ticks],
        }


def _event_ts(event: dict[str, Any]) -> float | None:
    ts = event.get("ts")
    if isinstance(ts, (int, float)):
        return float(ts)
    return None


def replay(
    events: list[dict[str, Any]],
    *,
    state: MonitorState,
    hub: AlertHub,
    speedup: float = 0.0,
    sleep_fn: Callable[[float], None] | None = None,
    tick_log_path: Path | str | None = None,
) -> DriftReplayReport:
    """Replay an event list, throttling between events by ts deltas.

    `speedup` > 0 enables wall-clock throttling — wall_delay =
    event_delta / speedup. `speedup == 0` disables sleep entirely.
    """
    sleep_fn = sleep_fn or time.sleep
    report = DriftReplayReport(
        bridge_report=BridgeReport(),
        speedup=speedup,
    )
    tick_log = None
    if tick_log_path is not None:
        tick_log = Path(tick_log_path)
        tick_log.parent.mkdir(parents=True, exist_ok=True)
        # Truncate any previous run
        tick_log.write_text("")

    prev_ts: float | None = None
    wall_start = time.perf_counter()
    for seq, event in enumerate(events, 1):
        ets = _event_ts(event)
        sleep_seconds = 0.0
        if speedup > 0 and prev_ts is not None and ets is not None:
            delta = max(0.0, ets - prev_ts)
            sleep_seconds = delta / speedup
            if sleep_seconds > 0:
                sleep_fn(sleep_seconds)
        prev_ts = ets if ets is not None else prev_ts

        # Feed one event through the bridge
        sub = bridge_iterable([event], state=state, hub=hub)
        report.bridge_report.events_received += sub.events_received
        report.bridge_report.spins_consumed += sub.spins_consumed
        report.bridge_report.non_spin_skipped += sub.non_spin_skipped
        report.bridge_report.decode_errors += sub.decode_errors
        report.bridge_report.snapshots_emitted += sub.snapshots_emitted
        report.bridge_report.alerts_dispatched.extend(sub.alerts_dispatched)
        if sub.last_snapshot is not None:
            report.bridge_report.last_snapshot = sub.last_snapshot

        tick = ReplayTick(
            sequence=seq,
            event_ts=ets,
            sleep_seconds=sleep_seconds,
            spins_consumed_at_tick=report.bridge_report.spins_consumed,
            snapshot_emitted=bool(sub.snapshots_emitted),
            alerts_at_tick=len(report.bridge_report.alerts_dispatched),
        )
        report.ticks.append(tick)
        if tick_log is not None:
            with tick_log.open("a") as f:
                f.write(json.dumps(tick.to_dict()) + "\n")

    report.total_wall_seconds = time.perf_counter() - wall_start
    return report


def replay_file(
    ndjson_path: Path | str,
    *,
    state: MonitorState,
    hub: AlertHub,
    speedup: float = 0.0,
    sleep_fn: Callable[[float], None] | None = None,
    tick_log_path: Path | str | None = None,
) -> DriftReplayReport:
    ndjson_path = Path(ndjson_path)
    events: list[dict[str, Any]] = []
    if not ndjson_path.exists():
        return DriftReplayReport(bridge_report=BridgeReport(), speedup=speedup)
    decode_errors = 0
    for line in ndjson_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            events.append(json.loads(line))
        except json.JSONDecodeError:
            decode_errors += 1
    report = replay(
        events, state=state, hub=hub, speedup=speedup,
        sleep_fn=sleep_fn, tick_log_path=tick_log_path,
    )
    report.bridge_report.decode_errors += decode_errors
    return report

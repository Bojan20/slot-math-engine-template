"""Telemetry bridge — feed RGS NDJSON → rtp_monitor → drift alert hub."""
from __future__ import annotations
import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from tools.rtp_monitor.monitor import MonitorState, RtpSnapshot
from tools.rgs_connector.connector import feed_event
from tools.drift_alert_hub.hub import AlertHub, DriftAlert


@dataclass
class BridgeReport:
    events_received: int = 0
    spins_consumed: int = 0
    non_spin_skipped: int = 0
    decode_errors: int = 0
    snapshots_emitted: int = 0
    alerts_dispatched: list[DriftAlert] = field(default_factory=list)
    last_snapshot: RtpSnapshot | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "events_received": self.events_received,
            "spins_consumed": self.spins_consumed,
            "non_spin_skipped": self.non_spin_skipped,
            "decode_errors": self.decode_errors,
            "snapshots_emitted": self.snapshots_emitted,
            "alerts_dispatched": [a.to_dict() for a in self.alerts_dispatched],
            "last_snapshot": (
                self.last_snapshot.to_dict()
                if self.last_snapshot is not None else None
            ),
        }


def bridge_iterable(
    events: Iterable[dict[str, Any]],
    *,
    state: MonitorState,
    hub: AlertHub,
) -> BridgeReport:
    """Consume an iterable of telemetry events and dispatch alerts."""
    report = BridgeReport()
    for event in events:
        if not isinstance(event, dict):
            report.decode_errors += 1
            continue
        report.events_received += 1
        snap = feed_event(state, event)
        if snap is None:
            report.non_spin_skipped += 1
            continue
        report.spins_consumed += 1
        report.snapshots_emitted += 1
        report.last_snapshot = snap
        report.alerts_dispatched.extend(hub.dispatch(snap.to_dict()))
    return report


def bridge_file(
    ndjson_path: Path | str,
    *,
    state: MonitorState,
    hub: AlertHub,
) -> BridgeReport:
    """Consume an NDJSON file and bridge to the alert hub."""
    ndjson_path = Path(ndjson_path)
    report = BridgeReport()
    if not ndjson_path.exists():
        return report
    decoded: list[dict[str, Any]] = []
    for line in ndjson_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            decoded.append(json.loads(line))
        except json.JSONDecodeError:
            report.decode_errors += 1
    sub = bridge_iterable(decoded, state=state, hub=hub)
    # Roll up decode_errors from BOTH file-level and per-event errors
    report.events_received = sub.events_received
    report.spins_consumed = sub.spins_consumed
    report.non_spin_skipped = sub.non_spin_skipped
    report.decode_errors += sub.decode_errors
    report.snapshots_emitted = sub.snapshots_emitted
    report.alerts_dispatched = sub.alerts_dispatched
    report.last_snapshot = sub.last_snapshot
    return report

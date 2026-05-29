"""W50 — Live RGS Connector core.

Pure-stdlib NDJSON ingestion bridge between W19 telemetry stream and
W29 rtp_monitor. Two transports:

  1. **File tail** — production RGS appends NDJSON lines to a log file;
     connector tails the file and feeds each spin into the monitor.
  2. **TCP NDJSON server** — bind a port, accept clients, read newline-
     delimited JSON. One spin per line.

Both transports converge on the same `feed_event(state, event)` call so
the monitor state evolves identically regardless of how events arrive.

The connector ignores non-spin events (`slot.session_started`,
`slot.heartbeat`, …) — the monitor only cares about `slot.spin_completed`.
"""
from __future__ import annotations
import json
import socket
import socketserver
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator

from tools.rtp_monitor.monitor import (
    MonitorState,
    RtpSnapshot,
    update_from_spin,
)


# ─── Spin event extraction ─────────────────────────────────────────


SPIN_EVENT_KIND = "slot.spin_completed"


def extract_spin(event: dict[str, Any]) -> tuple[float, float, int] | None:
    """Return ``(bet, pay, win_count)`` if the event is a spin-completed
    event, otherwise ``None``.

    The W19 schema guarantees `event_type` and `payload`, but we are
    defensive about missing keys so a malformed line never crashes the
    feeder.
    """
    if not isinstance(event, dict):
        return None
    if event.get("event_type") != SPIN_EVENT_KIND:
        return None
    payload = event.get("payload")
    if not isinstance(payload, dict):
        return None
    try:
        bet = float(payload.get("bet", 0.0))
        pay = float(payload.get("pay", 0.0))
    except (TypeError, ValueError):
        return None
    win_count = int(payload.get("win_count", 1 if pay > 0 else 0))
    return bet, pay, win_count


def feed_event(state: MonitorState, event: dict[str, Any]) -> RtpSnapshot | None:
    """Push one event into the monitor. Returns the latest snapshot
    when the event was a spin (otherwise ``None``)."""
    spin = extract_spin(event)
    if spin is None:
        return None
    bet, pay, win_count = spin
    return update_from_spin(state, bet=bet, pay=pay, win_count=win_count)


# ─── ConnectorReport ───────────────────────────────────────────────


@dataclass
class ConnectorReport:
    events_received: int = 0
    spins_consumed: int = 0
    non_spin_skipped: int = 0
    decode_errors: int = 0
    last_snapshot: RtpSnapshot | None = None
    snapshots: list[RtpSnapshot] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "events_received": self.events_received,
            "spins_consumed": self.spins_consumed,
            "non_spin_skipped": self.non_spin_skipped,
            "decode_errors": self.decode_errors,
            "last_snapshot": (
                self.last_snapshot.to_dict()
                if self.last_snapshot is not None
                else None
            ),
        }


# ─── File-tail transport ───────────────────────────────────────────


def tail_jsonl_stream(
    path: Path,
    *,
    state: MonitorState,
    follow: bool = False,
    poll_interval: float = 0.05,
    max_events: int | None = None,
    stop_when_empty: bool = True,
    report: ConnectorReport | None = None,
    on_snapshot: Callable[[dict[str, Any], RtpSnapshot], None] | None = None,
) -> Iterator[tuple[dict[str, Any], RtpSnapshot | None]]:
    """Yield ``(event, snapshot)`` for each line read from ``path``.

    Parameters
    ----------
    follow:
        If True, behave like ``tail -F`` — sleep ``poll_interval`` and
        retry when EOF is reached, until ``max_events`` is hit.
    stop_when_empty:
        When ``follow=False`` and the file ends, stop. (Otherwise
        ``tail_jsonl_stream`` would loop forever on a static file.)
    max_events:
        Optional cap to bound test runs.
    report:
        Mutated in place with counters; useful for tests.
    on_snapshot:
        Optional sink (e.g. JSON-log writer) called per spin.
    """
    if report is None:
        report = ConnectorReport()

    path = Path(path)
    fh = path.open("r", encoding="utf-8")
    seen = 0
    try:
        while True:
            line = fh.readline()
            if not line:
                if follow and (max_events is None or seen < max_events):
                    time.sleep(poll_interval)
                    continue
                if stop_when_empty:
                    return
                time.sleep(poll_interval)
                continue
            line = line.strip()
            if not line:
                continue
            report.events_received += 1
            seen += 1
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                report.decode_errors += 1
                continue
            snap = feed_event(state, event)
            if snap is None:
                report.non_spin_skipped += 1
                yield event, None
            else:
                report.spins_consumed += 1
                report.last_snapshot = snap
                report.snapshots.append(snap)
                if on_snapshot is not None:
                    on_snapshot(event, snap)
                yield event, snap
            if max_events is not None and seen >= max_events:
                return
    finally:
        fh.close()


# ─── TCP NDJSON transport ──────────────────────────────────────────


class _NdJsonHandler(socketserver.StreamRequestHandler):
    """Per-connection handler — reads newline-delimited JSON until EOF."""

    def handle(self) -> None:  # noqa: D401 — overridden
        server: "_NdJsonServer" = self.server  # type: ignore[assignment]
        while True:
            line = self.rfile.readline()
            if not line:
                break
            try:
                line = line.strip()
                if not line:
                    continue
                server.report.events_received += 1
                try:
                    event = json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    server.report.decode_errors += 1
                    continue
                with server.lock:
                    snap = feed_event(server.state, event)
                    if snap is None:
                        server.report.non_spin_skipped += 1
                    else:
                        server.report.spins_consumed += 1
                        server.report.last_snapshot = snap
                        server.report.snapshots.append(snap)
                        if server.on_snapshot is not None:
                            server.on_snapshot(event, snap)
                if (
                    server.max_events is not None
                    and server.report.events_received >= server.max_events
                ):
                    server.shutdown_async()
                    break
            except Exception:
                # Never let one bad line poison the server.
                continue


class _NdJsonServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(
        self,
        addr: tuple[str, int],
        state: MonitorState,
        *,
        report: ConnectorReport,
        max_events: int | None,
        on_snapshot: Callable[[dict[str, Any], RtpSnapshot], None] | None,
    ) -> None:
        super().__init__(addr, _NdJsonHandler)
        self.state = state
        self.report = report
        self.max_events = max_events
        self.on_snapshot = on_snapshot
        self.lock = threading.Lock()

    def shutdown_async(self) -> None:
        threading.Thread(target=self.shutdown, daemon=True).start()


def serve_tcp(
    host: str,
    port: int,
    state: MonitorState,
    *,
    max_events: int | None = None,
    on_snapshot: Callable[[dict[str, Any], RtpSnapshot], None] | None = None,
    report: ConnectorReport | None = None,
    ready_event: threading.Event | None = None,
) -> ConnectorReport:
    """Bind ``(host, port)`` and serve NDJSON until ``max_events`` is hit
    (or ``shutdown_async`` is called externally).

    Returns the populated ``ConnectorReport`` for inspection.
    """
    if report is None:
        report = ConnectorReport()
    server = _NdJsonServer(
        (host, port),
        state,
        report=report,
        max_events=max_events,
        on_snapshot=on_snapshot,
    )
    try:
        if ready_event is not None:
            ready_event.set()
        server.serve_forever(poll_interval=0.05)
    finally:
        server.server_close()
    return report


def client_send(host: str, port: int, events: list[dict[str, Any]]) -> int:
    """Send NDJSON events to a connector and return the byte count.

    Convenience for tests and standalone shipping scripts."""
    payload = ""
    for ev in events:
        payload += json.dumps(ev, separators=(",", ":")) + "\n"
    data = payload.encode("utf-8")
    with socket.create_connection((host, port), timeout=5.0) as s:
        s.sendall(data)
    return len(data)


# ─── Pick-a-free-port helper (used by tests + CLI ephemeral mode) ──


def pick_free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


# Re-exports for backward-compatible test imports
__all__ = [
    "extract_spin",
    "feed_event",
    "tail_jsonl_stream",
    "serve_tcp",
    "client_send",
    "ConnectorReport",
    "pick_free_port",
    "SPIN_EVENT_KIND",
]

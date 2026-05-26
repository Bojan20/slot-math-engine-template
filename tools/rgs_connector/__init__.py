"""W50 — Live RGS Connector.

Streams W19 telemetry events from a running engine (TCP socket or NDJSON
tail file) directly into the W29 `rtp_monitor.MonitorState`. Designed
for production drift gates: an RGS emits `slot.spin_completed` events as
they happen, the connector decodes + validates them, extracts (bet, pay),
and updates the monitor in real time.

Public surface:
  • `extract_spin(event)`        → (bet, pay) tuple or None for non-spin events
  • `feed_event(state, event)`   → RtpSnapshot
  • `tail_jsonl_stream(path, …)` → generator of (event, snapshot)
  • `serve_tcp(host, port, …)`   → blocking TCP NDJSON listener
  • `client_send(host, port, ev)` → helper for tests / shipping
"""
from tools.rgs_connector.connector import (
    extract_spin,
    feed_event,
    tail_jsonl_stream,
    serve_tcp,
    client_send,
    ConnectorReport,
)

__all__ = [
    "extract_spin",
    "feed_event",
    "tail_jsonl_stream",
    "serve_tcp",
    "client_send",
    "ConnectorReport",
]

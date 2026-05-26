"""W62 — Telemetry → Drift Hub Bridge.

Closes the live-monitoring loop: an NDJSON spin feed (matching the
W19 telemetry schema / W50 RGS connector format) is consumed,
each spin pushed through ``rtp_monitor.update_from_spin``, and every
emitted ``RtpSnapshot`` fanned out to a W54 ``AlertHub`` for
rule-based notification.

Two transports converge on the same bridge:
  * **File** — read a static NDJSON file (regression fixtures + CI).
  * **Stream** — iterate any ``Iterable[dict]`` (live tail, in-process).

The bridge is pure stdlib; sinks live in the W54 hub.
"""
from tools.telemetry_bridge.bridge import (
    BridgeReport,
    bridge_iterable,
    bridge_file,
)

__all__ = [
    "BridgeReport",
    "bridge_iterable",
    "bridge_file",
]

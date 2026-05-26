"""W29 — Live RTP Monitor.

Reads a (potentially streaming) JSONL spin log and computes:

  • Cumulative RTP, hit-frequency, win-frequency
  • Rolling-window RTP (N most recent spins)
  • Drift severity vs target RTP (green / yellow / red)
  • EWMA RTP for trend detection
  • Anomaly counters (per-window z-score breaches)

Designed to drive a production dashboard or a CI gate that consumes
spin logs produced by the engine.
"""
from tools.rtp_monitor.monitor import (
    MonitorState,
    RtpSnapshot,
    update_from_spin,
    update_from_stream,
    classify_drift,
)

__all__ = [
    "MonitorState",
    "RtpSnapshot",
    "update_from_spin",
    "update_from_stream",
    "classify_drift",
]

"""W36 — RTP Curve Sweep.

Sweep one numeric parameter of a closed-form kernel (or analytical
RTP function) across a range and emit (x, y) points plus a simple
ASCII chart. Designer-facing tool: "what happens to RTP if I bump
this trigger prob from 0.05 to 0.25?"
"""
from tools.rtp_sweep.sweeper import (
    SweepPoint,
    SweepResult,
    sweep,
    ascii_chart,
)

__all__ = [
    "SweepPoint",
    "SweepResult",
    "sweep",
    "ascii_chart",
]

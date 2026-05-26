"""W58 — IR Diff CI Gate.

Production-ready CI guard wrapping ``tools.diagnostics.ir_diff``.
Compares two IRs (e.g., baseline IR vs HEAD's IR after a PR change)
against a configurable rules ladder:

  * ``max_rtp_delta``           — abs(RTP estimate delta) ≤ limit
  * ``max_paytable_changes``    — added+removed+changed pay rows
  * ``allow_feature_additions`` — True allows kinds only in B
  * ``allow_feature_removals``  — True allows kinds only in A
  * ``allow_meta_drift``        — True allows meta changes
  * ``allow_topology_change``   — True allows reels/rows/paylines change

Each rule returns a finding; the gate verdict aggregates into a
single PASS / WARN / FAIL exit code (0 / 1 / 2). WARN currently maps
to FAIL — kept as a separate column to make CI logs explicit.
"""
from tools.ir_diff_gate.gate import (
    GateConfig,
    GateFinding,
    GateReport,
    GateSeverity,
    run_gate,
)

__all__ = [
    "GateConfig",
    "GateFinding",
    "GateReport",
    "GateSeverity",
    "run_gate",
]

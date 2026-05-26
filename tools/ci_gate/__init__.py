"""W14 — CI Gate Aggregator.

One command, all QA gates. Chains:

  • Drift Sentinel (W11)             — repo-wide silent IR drift gate
  • Cert Matrix (Mission #3)         — 12×12 topology × feature sweep
  • Cert XML sanity (W5.6+)          — every IR re-emits valid XML
  • Jurisdiction lint × IRs × profiles (P1.7)

Emits a consolidated CI report (`ci-gate.json` + Markdown) and an
exit code that gates the entire build:
  0  every gate passed
  1  at least one gate produced WARN / FAIL findings
  2  hard error (config / tool crash)
"""
from tools.ci_gate.aggregator import (
    CiGateConfig,
    CiGateReport,
    GateResult,
    GateStatus,
    run_ci_gate,
)

__all__ = [
    "CiGateConfig",
    "CiGateReport",
    "GateResult",
    "GateStatus",
    "run_ci_gate",
]

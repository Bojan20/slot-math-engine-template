"""Operator Pilot Suite — end-to-end orchestration.

One command, one input IR, one output directory — chains every
mission-acceptance artifact:

  • Universal IR (validated)
  • Jurisdiction lint reports (1 or many)
  • Regulator XML cert (urn:slotmath:cert:v1)
  • Signed cert ZIP (ed25519 manifest + verify.sh)
  • Optional MC + matrix sweep
  • operator-pilot.json — consolidated manifest

Designed for operator hand-off: drop a real or synthetic IR in,
get a "ready for regulator" folder out.
"""
from tools.operator_pilot.orchestrator import (
    PilotConfig,
    PilotStep,
    PilotReport,
    run_pilot,
)

__all__ = [
    "PilotConfig",
    "PilotStep",
    "PilotReport",
    "run_pilot",
]

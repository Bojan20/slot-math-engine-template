"""W24 — Audit Trail Aggregator.

Walks an `games/<id>/` tree and collects every audit-trail artifact
into a single chronological timeline:

  • Git log for the game dir
  • `meta.notes` entries from universal/TS/vendor IRs
  • MC report manifests
  • Cert ZIP signatures + timestamps
  • Drift sentinel baseline diffs
  • Jurisdiction lint reports
  • Operator-pilot orchestration logs

Output: JSON timeline + Markdown human-readable trail + optional HTML.

Use cases:
  • Regulator audit prep — "show me everything that happened to
    swid=200-1775-001 between 2026-01 and 2026-05"
  • Post-mortem when a cert was rejected
  • Compliance officer onboarding to a new game
"""
from .aggregator import (
    AuditEntry,
    AuditTrail,
    aggregate_game_trail,
    emit_trail,
)

__all__ = [
    "AuditEntry",
    "AuditTrail",
    "aggregate_game_trail",
    "emit_trail",
]

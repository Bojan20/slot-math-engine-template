"""W44 — Historical Jurisdiction Backtest Runner.

Takes a current IR + a list of historical jurisdiction rule snapshots
and replays compliance checks against each snapshot. Used for:

  • Confirming an IR was compliant under last quarter's rules
  • Detecting whether a jurisdiction rule change would have failed
    games released earlier
  • Building audit trail "this IR was compliant on each snapshot
    date" for retroactive certification.
"""
from tools.backtest_runner.runner import (
    JurisdictionSnapshot,
    BacktestEntry,
    BacktestReport,
    check_against_rules,
    backtest,
)

__all__ = [
    "JurisdictionSnapshot",
    "BacktestEntry",
    "BacktestReport",
    "check_against_rules",
    "backtest",
]

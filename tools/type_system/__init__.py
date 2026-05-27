"""PHASE 32 — Slot Math Type System.

Algebraic type validator for IR documents. Operates as a strict
schema check + emits structured `TypeError`-style diagnostics
(path-prefixed). Pure stdlib.

Defined types:
  - Reel = list[ReelCell]
  - ReelCell = { symbol: str, weight: int ≥ 1 }
  - Payline = list[int]
  - Paytable entry = { combo: list[str], pays: float ≥ 0,
                       scope?: "line" | "scatter" | "cluster" }
  - Feature = { kind: str, ... }

Public API:
    from tools.type_system import (
        type_check_ir,
        TypeIssue,
        TypeReport,
    )

    report = type_check_ir(ir)
    if not report.ok:
        for issue in report.issues:
            print(f"{issue.path}: {issue.kind}: {issue.message}")
"""

from __future__ import annotations

from tools.type_system.checker import (
    type_check_ir,
    TypeIssue,
    TypeReport,
)

__all__ = ["type_check_ir", "TypeIssue", "TypeReport"]
